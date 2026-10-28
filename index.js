require("dotenv").config();
const fs = require("fs");
const path = require("path");

const API_TOKEN = process.env.BETTERSTACK_API_TOKEN;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const POLL_INTERVAL = (parseInt(process.env.POLL_INTERVAL_SECONDS, 10) || 30) * 1000;
const STATUS_PAGE_URL = process.env.STATUS_PAGE_URL || "https://status.roleflow.site";
const NOTIFY_ROLE_ID = process.env.DISCORD_ROLE_ID || "1565074386866802788";
const STATE_FILE = path.join(__dirname, "state.json");

if (!API_TOKEN || !WEBHOOK_URL) {
  console.error("Missing BETTERSTACK_API_TOKEN or DISCORD_WEBHOOK_URL in .env!");
  process.exit(1);
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    }
  } catch (e) {
    console.warn("Could not read state.json, initializing clean state:", e.message);
  }
  return {
    monitors: {},
    lastIncidentIds: [],
    initialized: false,
  };
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to write state.json:", e.message);
  }
}

async function postDiscordWebhook(embed, isDown = false) {
  try {
    const payload = {
      username: "RoleFlow Status",
      avatar_url: "https://roleflow.site/logo.png",
      content: isDown && NOTIFY_ROLE_ID ? `<@&${NOTIFY_ROLE_ID}>` : "",
      allowed_mentions: {
        roles: [NOTIFY_ROLE_ID],
      },
      embeds: [embed],
    };

    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Discord webhook error (${res.status}):`, errText);
    } else {
      console.log(`[Discord] Webhook delivered: "${embed.title}"`);
    }
  } catch (err) {
    console.error("Error posting to Discord webhook:", err.message);
  }
}

function createStatusEmbed({ name, url, previousStatus, currentStatus, reason }) {
  const isUp = currentStatus === "up" || currentStatus === "Resolved";
  const isDown = currentStatus === "down" || currentStatus === "Ongoing" || currentStatus === "Started";

  const color = isUp ? 0x22c55e : isDown ? 0xef4444 : 0xf59e0b;
  const statusEmoji = isUp ? "🟢" : isDown ? "🔴" : "🟡";
  const statusTitle = isUp ? "OPERATIONAL / RESOLVED" : isDown ? "SERVICE DISRUPTED / DOWN" : "MAINTENANCE";

  const description = isUp
    ? `**System Recovered:** All services on this endpoint are operational and responding normally.`
    : `**Service Disruption Detected:** An outage or degraded performance has been detected by the uptime probe.`;

  return {
    title: `${statusEmoji} ${name}: ${statusTitle}`,
    url: STATUS_PAGE_URL,
    color,
    description,
    fields: [
      {
        name: "Endpoint URL",
        value: `\`${url || "N/A"}\``,
        inline: true,
      },
      {
        name: "Current State",
        value: `\`${(currentStatus || "unknown").toUpperCase()}\``,
        inline: true,
      },
      {
        name: "Failure Reason / Root Cause",
        value: `\`${reason || "unknown"}\``,
        inline: false,
      },
      {
        name: "Live Status Page",
        value: `[status.roleflow.site](${STATUS_PAGE_URL})`,
        inline: false,
      },
    ],
    footer: {
      text: "RoleFlow Uptime & SRE Network • BetterStack Relay",
      icon_url: "https://roleflow.site/logo.png",
    },
    timestamp: new Date().toISOString(),
  };
}

async function checkMonitors(state) {
  try {
    const res = await fetch("https://uptime.betterstack.com/api/v2/monitors", {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    });

    if (!res.ok) {
      console.error(`Failed to fetch BetterStack monitors: HTTP ${res.status}`);
      return;
    }

    const json = await res.json();
    const monitors = json.data || [];

    const incRes = await fetch("https://uptime.betterstack.com/api/v2/incidents", {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    });
    const incJson = incRes.ok ? await incRes.json() : { data: [] };
    const incidentMap = {};
    for (const inc of incJson.data || []) {
      const a = inc.attributes;
      if (a.status === "Ongoing" || a.status === "Started") {
        incidentMap[a.url] = a.cause || "unknown";
      }
    }

    for (const item of monitors) {
      const id = item.id;
      const attrs = item.attributes;
      const currentStatus = attrs.status;
      const previousStatus = state.monitors[id];

      if (!state.initialized) {
        state.monitors[id] = currentStatus;
        continue;
      }

      if (previousStatus && previousStatus !== currentStatus) {
        const isDown = currentStatus === "down";
        const reason = incidentMap[attrs.url] || (currentStatus === "up" ? "HTTP 200 OK — Probe Passed" : "unknown");
        console.log(`[Status Change] ${attrs.pronounceable_name}: ${previousStatus} -> ${currentStatus} (Reason: ${reason})`);
        const embed = createStatusEmbed({
          name: attrs.pronounceable_name || attrs.url,
          url: attrs.url,
          previousStatus,
          currentStatus,
          reason,
        });
        await postDiscordWebhook(embed, isDown);
        state.monitors[id] = currentStatus;
        saveState(state);
      } else if (!previousStatus) {
        state.monitors[id] = currentStatus;
        saveState(state);
      }
    }

    if (!state.initialized) {
      state.initialized = true;
      saveState(state);
      console.log(`[Initialization] Loaded ${monitors.length} BetterStack monitors. Polling every ${POLL_INTERVAL / 1000}s...`);
    }
  } catch (err) {
    console.error("Monitor polling loop error:", err.message);
  }
}

async function main() {
  console.log("=== RoleFlow BetterStack Status Relay Bot Started ===");
  console.log(`Target Status Page: ${STATUS_PAGE_URL}`);
  const state = loadState();

  await checkMonitors(state);

  setInterval(() => {
    checkMonitors(state);
  }, POLL_INTERVAL);
}

main().catch(console.error);
