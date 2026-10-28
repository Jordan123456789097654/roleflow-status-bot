require("dotenv").config();
const fs = require("fs");
const path = require("path");

const API_TOKEN = process.env.BETTERSTACK_API_TOKEN;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const POLL_INTERVAL = (parseInt(process.env.POLL_INTERVAL_SECONDS, 10) || 30) * 1000;
const STATUS_PAGE_URL = process.env.STATUS_PAGE_URL || "https://status.roleflow.site";
const NOTIFY_ROLE_ID = process.env.DISCORD_ROLE_ID || "1565074386866802788";
const APP_URL = process.env.APP_URL || "https://roleflow.site";
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
    maintenance: {
      enabled: null,
      message: "",
    },
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

async function postDiscordWebhook(payload) {
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Discord webhook error (${res.status}):`, errText);
    } else {
      console.log(`[Discord] Webhook delivered: "${payload.embeds?.[0]?.title || "Status Alert"}"`);
    }
  } catch (err) {
    console.error("Error posting to Discord webhook:", err.message);
  }
}

function createMaintenanceEmbed(enabled, message) {
  if (enabled) {
    return {
      title: "🟡 Scheduled Platform Maintenance in Progress",
      url: STATUS_PAGE_URL,
      color: 0xf59e0b,
      description:
        "**Platform Maintenance Activated:** RoleFlow has entered scheduled maintenance mode. Public submission queues and candidate portals are temporarily locked while upgrades are applied.",
      fields: [
        {
          name: "Reason / Maintenance Scope",
          value: `\`${message || "RoleFlow is currently undergoing scheduled platform maintenance. Please check back shortly."}\``,
          inline: false,
        },
        {
          name: "Affected Systems",
          value: "`roleflow.site web portal, candidate forms, public browse`",
          inline: true,
        },
        {
          name: "Staff & Founder Access",
          value: "`Bypass active via Discord OAuth`",
          inline: true,
        },
        {
          name: "Live Status Page",
          value: `[status.roleflow.site](${STATUS_PAGE_URL})`,
          inline: false,
        },
      ],
      footer: {
        text: "RoleFlow SRE Operations • Automated Maintenance Broadcast",
        icon_url: "https://roleflow.site/logo.png",
      },
      timestamp: new Date().toISOString(),
    };
  } else {
    return {
      title: "🟢 Scheduled Maintenance Completed — Platform Restored",
      url: STATUS_PAGE_URL,
      color: 0x22c55e,
      description:
        "**Maintenance Complete:** Platform upgrades have finished. RoleFlow is fully operational and public access has been restored.",
      fields: [
        {
          name: "Platform Status",
          value: "`100% OPERATIONAL`",
          inline: true,
        },
        {
          name: "System Health",
          value: "`All endpoints returning HTTP 200 OK`",
          inline: true,
        },
        {
          name: "Live Web Portal",
          value: `[roleflow.site](${APP_URL}) • [status.roleflow.site](${STATUS_PAGE_URL})`,
          inline: false,
        },
      ],
      footer: {
        text: "RoleFlow SRE Operations • Maintenance Concluded",
        icon_url: "https://roleflow.site/logo.png",
      },
      timestamp: new Date().toISOString(),
    };
  }
}

function createConsolidatedOutageEmbed(outages) {
  const isMulti = outages.length > 1;
  const title = isMulti
    ? `🚨 MULTIPLE SERVICES DISRUPTED (${outages.length} Monitors Affected)`
    : `🔴 ${outages[0].name}: SERVICE DISRUPTED / DOWN`;

  const fields = outages.map((item, idx) => ({
    name: `${idx + 1}. ${item.name}`,
    value: `• **Endpoint**: \`${item.url}\`\n• **Status**: \`${item.currentStatus.toUpperCase()}\`\n• **Reason**: \`${item.reason || "unknown"}\``,
    inline: false,
  }));

  fields.push({
    name: "Live Status Page",
    value: `[status.roleflow.site](${STATUS_PAGE_URL})`,
    inline: false,
  });

  return {
    title,
    url: STATUS_PAGE_URL,
    color: 0xef4444,
    description: `**Infrastructure Incident Detected:** ${
      isMulti
        ? `BetterStack probes detected concurrent outages across **${outages.length} endpoints**. SRE investigation initiated.`
        : `An outage or degraded response was detected for this service.`
    }`,
    fields,
    footer: {
      text: "RoleFlow Uptime & SRE Network • Consolidated Alert",
      icon_url: "https://roleflow.site/logo.png",
    },
    timestamp: new Date().toISOString(),
  };
}

function createConsolidatedRecoveryEmbed(recoveries) {
  const isMulti = recoveries.length > 1;
  const title = isMulti
    ? `🟢 ALL SERVICES RESTORED (${recoveries.length} Monitors Operational)`
    : `🟢 ${recoveries[0].name}: OPERATIONAL / RESOLVED`;

  const fields = recoveries.map((item, idx) => ({
    name: `${idx + 1}. ${item.name}`,
    value: `• **Endpoint**: \`${item.url}\`\n• **Status**: \`UP (200 OK)\`\n• **Resolution**: \`${item.reason}\``,
    inline: false,
  }));

  fields.push({
    name: "Live Status Page",
    value: `[status.roleflow.site](${STATUS_PAGE_URL})`,
    inline: false,
  });

  return {
    title,
    url: STATUS_PAGE_URL,
    color: 0x22c55e,
    description: `**Systems Operational:** Probes are successfully returning HTTP 200 OK. Latency and health metrics have stabilized.`,
    fields,
    footer: {
      text: "RoleFlow Uptime & SRE Network • Service Recovery",
      icon_url: "https://roleflow.site/logo.png",
    },
    timestamp: new Date().toISOString(),
  };
}

async function checkSystem(state) {
  try {
    // 1. AUTO-MAINTENANCE SYNC
    try {
      const maintRes = await fetch(`${APP_URL}/api/admin/maintenance`, { cache: "no-store" });
      if (maintRes.ok) {
        const maintData = await maintRes.json();
        const currentEnabled = Boolean(maintData.enabled);
        const currentMsg = maintData.message || "";

        if (state.maintenance && state.maintenance.enabled !== null && state.maintenance.enabled !== currentEnabled) {
          console.log(`[Maintenance Change] Enabled: ${state.maintenance.enabled} -> ${currentEnabled} (${currentMsg})`);
          const maintEmbed = createMaintenanceEmbed(currentEnabled, currentMsg);
          await postDiscordWebhook({
            username: "RoleFlow Status",
            avatar_url: "https://roleflow.site/logo.png",
            content: currentEnabled && NOTIFY_ROLE_ID ? `<@&${NOTIFY_ROLE_ID}>` : "",
            allowed_mentions: { roles: [NOTIFY_ROLE_ID] },
            embeds: [maintEmbed],
          });
        }

        state.maintenance = {
          enabled: currentEnabled,
          message: currentMsg,
        };
        saveState(state);
      }
    } catch (e) {
      console.warn("Could not check maintenance mode:", e.message);
    }

    // 2. BETTERSTACK MONITORS
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

    const pendingOutages = [];
    const pendingRecoveries = [];

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
        const isUp = currentStatus === "up";
        const reason = incidentMap[attrs.url] || (isUp ? "HTTP 200 OK — Probe Passed" : "unknown");

        const record = {
          name: attrs.pronounceable_name || attrs.url,
          url: attrs.url,
          previousStatus,
          currentStatus,
          reason,
        };

        if (isDown) {
          pendingOutages.push(record);
        } else if (isUp) {
          pendingRecoveries.push(record);
        }
      }

      state.monitors[id] = currentStatus;
    }

    if (!state.initialized) {
      state.initialized = true;
      saveState(state);
      console.log(`[Initialization] Loaded ${monitors.length} BetterStack monitors. Polling every ${POLL_INTERVAL / 1000}s...`);
      return;
    }

    // DISPATCH MERGED OUTAGES
    if (pendingOutages.length > 0) {
      console.log(`[Consolidated Outage] Merging ${pendingOutages.length} monitor failure(s) into 1 ping`);
      const embed = createConsolidatedOutageEmbed(pendingOutages);
      await postDiscordWebhook({
        username: "RoleFlow Status",
        avatar_url: "https://roleflow.site/logo.png",
        content: NOTIFY_ROLE_ID ? `<@&${NOTIFY_ROLE_ID}>` : "",
        allowed_mentions: { roles: [NOTIFY_ROLE_ID] },
        embeds: [embed],
      });
      saveState(state);
    }

    // DISPATCH MERGED RECOVERIES
    if (pendingRecoveries.length > 0) {
      console.log(`[Consolidated Recovery] Merging ${pendingRecoveries.length} monitor recovery(ies) into 1 embed`);
      const embed = createConsolidatedRecoveryEmbed(pendingRecoveries);
      await postDiscordWebhook({
        username: "RoleFlow Status",
        avatar_url: "https://roleflow.site/logo.png",
        content: "",
        embeds: [embed],
      });
      saveState(state);
    }
  } catch (err) {
    console.error("Monitor polling loop error:", err.message);
  }
}

async function main() {
  console.log("=== RoleFlow BetterStack & Maintenance Relay Bot Started (Consolidated Mode) ===");
  console.log(`Target Status Page: ${STATUS_PAGE_URL}`);
  const state = loadState();

  await checkSystem(state);

  setInterval(() => {
    checkSystem(state);
  }, POLL_INTERVAL);
}

main().catch(console.error);
