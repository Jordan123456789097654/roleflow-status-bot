const API_TOKEN = process.env.BETTERSTACK_API_TOKEN;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const STATUS_PAGE_URL = process.env.STATUS_PAGE_URL || "https://status.roleflow.site";
const NOTIFY_ROLE_ID = process.env.DISCORD_ROLE_ID || "1565074386866802788";
const APP_URL = process.env.APP_URL || "https://roleflow.site";

// Simple in-memory fallback cache across warm serverless invocations
let memoryCache = {
  monitors: {},
  maintenance: {
    enabled: null, // null until first read
    message: "",
  },
  initialized: false,
};

async function postDiscordWebhook(embed, pingRole = false) {
  try {
    const payload = {
      username: "RoleFlow Status",
      avatar_url: "https://roleflow.site/logo.png",
      content: pingRole && NOTIFY_ROLE_ID ? `<@&${NOTIFY_ROLE_ID}>` : "",
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

    return res.ok;
  } catch (e) {
    console.error("Webhook dispatch error:", e);
    return false;
  }
}

function createMaintenanceEmbed(enabled, message) {
  if (enabled) {
    return {
      title: "🟡 Scheduled Platform Maintenance in Progress",
      url: STATUS_PAGE_URL,
      color: 0xf59e0b, // Amber Gold
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
      color: 0x22c55e, // Emerald Green
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

function createStatusEmbed({ name, url, previousStatus, currentStatus, reason, incidentStartedAt }) {
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
    timestamp: incidentStartedAt || new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  if (!API_TOKEN || !WEBHOOK_URL) {
    return res.status(500).json({ error: "Missing BETTERSTACK_API_TOKEN or DISCORD_WEBHOOK_URL" });
  }

  try {
    const changes = [];

    // --- 1. AUTO-MAINTENANCE SYNC CHECK ---
    try {
      const maintRes = await fetch(`${APP_URL}/api/admin/maintenance`, { cache: "no-store" });
      if (maintRes.ok) {
        const maintData = await maintRes.json();
        const currentEnabled = Boolean(maintData.enabled);
        const currentMsg = maintData.message || "";

        // Detect transition from previous state
        if (memoryCache.maintenance.enabled !== null && memoryCache.maintenance.enabled !== currentEnabled) {
          const maintEmbed = createMaintenanceEmbed(currentEnabled, currentMsg);
          // Ping role if entering maintenance, don't ping when resolved
          await postDiscordWebhook(maintEmbed, currentEnabled);
          changes.push({
            type: "MAINTENANCE_TOGGLE",
            enabled: currentEnabled,
            reason: currentMsg,
          });
        }

        memoryCache.maintenance = {
          enabled: currentEnabled,
          message: currentMsg,
        };
      }
    } catch (maintErr) {
      console.warn("Could not check maintenance endpoint:", maintErr.message);
    }

    // --- 2. BETTERSTACK MONITORS CHECK ---
    const monitorsRes = await fetch("https://uptime.betterstack.com/api/v2/monitors", {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    });

    if (!monitorsRes.ok) {
      return res.status(monitorsRes.status).json({ error: "Failed to fetch monitors from BetterStack" });
    }

    const monitorsData = await monitorsRes.json();
    const monitors = monitorsData.data || [];

    // --- 3. BETTERSTACK INCIDENTS ROOT CAUSE CHECK ---
    const incidentsRes = await fetch("https://uptime.betterstack.com/api/v2/incidents", {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    });
    const incidentsData = incidentsRes.ok ? await incidentsRes.json() : { data: [] };
    const incidents = incidentsData.data || [];

    const incidentMap = {};
    for (const inc of incidents) {
      const attrs = inc.attributes;
      if (attrs.status === "Ongoing" || attrs.status === "Started") {
        incidentMap[attrs.url] = attrs.cause || "unknown";
      }
    }

    for (const m of monitors) {
      const id = m.id;
      const attrs = m.attributes;
      const currentStatus = attrs.status;
      const previousStatus = memoryCache.monitors[id];

      if (memoryCache.initialized && previousStatus && previousStatus !== currentStatus) {
        const isDown = currentStatus === "down";
        const reason = incidentMap[attrs.url] || (currentStatus === "up" ? "HTTP 200 OK — Probe Passed" : "unknown");

        const embed = createStatusEmbed({
          name: attrs.pronounceable_name || attrs.url,
          url: attrs.url,
          previousStatus,
          currentStatus,
          reason,
        });

        await postDiscordWebhook(embed, isDown);
        changes.push({
          type: "MONITOR_STATUS",
          name: attrs.pronounceable_name,
          from: previousStatus,
          to: currentStatus,
          reason,
        });
      }

      memoryCache.monitors[id] = currentStatus;
    }

    memoryCache.initialized = true;

    return res.status(200).json({
      success: true,
      monitorsChecked: monitors.length,
      maintenanceModeActive: memoryCache.maintenance.enabled,
      statusChangesProcessed: changes.length,
      changes,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Vercel cron error:", err);
    return res.status(500).json({ error: err.message });
  }
}
