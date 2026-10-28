require("dotenv").config();
const fs = require("fs");
const path = require("path");

const API_TOKEN = process.env.BETTERSTACK_API_TOKEN;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const POLL_INTERVAL = (parseInt(process.env.POLL_INTERVAL_SECONDS, 10) || 30) * 1000;
const STATUS_PAGE_URL = process.env.STATUS_PAGE_URL || "https://status.roleflow.site";
const STATE_FILE = path.join(__dirname, "state.json");

if (!API_TOKEN || !WEBHOOK_URL) {
  console.error("Missing BETTERSTACK_API_TOKEN or DISCORD_WEBHOOK_URL in .env!");
  process.exit(1);
}

// Read saved state to avoid duplicate alerts across restarts
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    }
  } catch (e) {
    console.warn("Could not read state.json, initializing clean state:", e.message);
  }
  return {
    monitors: {}, // { [id]: status }
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

// Send high-aesthetic Discord Embed
async function postDiscordWebhook(embed) {
  try {
    const payload = {
      username: "RoleFlow Status",
      avatar_url: "https://roleflow.site/logo.png",
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

// Format status embed
function createMonitorStatusEmbed(monitor, oldStatus, newStatus) {
  const isUp = newStatus === "up";
  const isDown = newStatus === "down";
  const isDegraded = newStatus === "maintenance" || newStatus === "paused";

  const color = isUp ? 0x22c55e : isDown ? 0xef4444 : 0xf59e0b; // Green / Red / Amber
  const statusEmoji = isUp ? "🟢" : isDown ? "🔴" : "🟡";
  const title = `${statusEmoji} ${monitor.pronounceable_name || monitor.url}: ${newStatus.toUpperCase()}`;

  const description = isUp
    ? `**System Recovered:** All services on this endpoint are responding with optimal latency and returning HTTP 200 OK.`
    : `**Service Disruption Detected:** This endpoint is currently unreachable or returned an unhealthy response code. Our infrastructure team is investigating.`;

  return {
    title,
    url: STATUS_PAGE_URL,
    color,
    description,
    fields: [
      {
        name: "Endpoint URL",
        value: `\`${monitor.url}\``,
        inline: true,
      },
      {
        name: "Previous State",
        value: `\`${(oldStatus || "unknown").toUpperCase()}\``,
        inline: true,
      },
      {
        name: "Current State",
        value: `\`${newStatus.toUpperCase()}\``,
        inline: true,
      },
      {
        name: "Live Status Page",
        value: `[View Live Incident Status](${STATUS_PAGE_URL})`,
        inline: false,
      },
    ],
    footer: {
      text: "RoleFlow Uptime & SRE Network • Automated Monitor",
      icon_url: "https://roleflow.site/logo.png",
    },
    timestamp: new Date().toISOString(),
  };
}

// Fetch monitors from BetterStack API v2
async function checkMonitors(state) {
  try {
    const res = await fetch("https://uptime.betterstack.com/api/v2/monitors", {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
      },
    });

    if (!res.ok) {
      console.error(`Failed to fetch BetterStack monitors: HTTP ${res.status}`);
      return;
    }

    const json = await res.json();
    const monitors = json.data || [];

    for (const item of monitors) {
      const id = item.id;
      const attrs = item.attributes;
      const currentStatus = attrs.status; // 'up', 'down', 'maintenance', 'paused'
      const previousStatus = state.monitors[id];

      // If initial run, just record current status
      if (!state.initialized) {
        state.monitors[id] = currentStatus;
        continue;
      }

      // Check if status changed
      if (previousStatus && previousStatus !== currentStatus) {
        console.log(`[Status Change] ${attrs.pronounceable_name}: ${previousStatus} -> ${currentStatus}`);
        const embed = createMonitorStatusEmbed(attrs, previousStatus, currentStatus);
        await postDiscordWebhook(embed);
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

// Main Polling Loop
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
