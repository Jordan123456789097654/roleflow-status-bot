const API_TOKEN = process.env.BETTERSTACK_API_TOKEN;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const STATUS_PAGE_URL = process.env.STATUS_PAGE_URL || "https://status.roleflow.site";
const NOTIFY_ROLE_ID = process.env.DISCORD_ROLE_ID || "1565074386866802788";

// Simple in-memory fallback cache across warm serverless invocations
let memoryCache = {
  monitors: {},
  lastIncidentIds: [],
  initialized: false,
};

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

    return res.ok;
  } catch (e) {
    console.error("Webhook dispatch error:", e);
    return false;
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
    // 1. Fetch live monitors from BetterStack API
    const monitorsRes = await fetch("https://uptime.betterstack.com/api/v2/monitors", {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    });

    if (!monitorsRes.ok) {
      return res.status(monitorsRes.status).json({ error: "Failed to fetch monitors from BetterStack" });
    }

    const monitorsData = await monitorsRes.json();
    const monitors = monitorsData.data || [];

    // 2. Fetch active incidents to get the exact failure reason / status code
    const incidentsRes = await fetch("https://uptime.betterstack.com/api/v2/incidents", {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    });
    const incidentsData = incidentsRes.ok ? await incidentsRes.json() : { data: [] };
    const incidents = incidentsData.data || [];

    // Build map of active incidents by URL / name
    const incidentMap = {};
    for (const inc of incidents) {
      const attrs = inc.attributes;
      if (attrs.status === "Ongoing" || attrs.status === "Started") {
        incidentMap[attrs.url] = attrs.cause || "unknown";
      }
    }

    const changes = [];

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
        changes.push({ name: attrs.pronounceable_name, from: previousStatus, to: currentStatus, reason });
      }

      memoryCache.monitors[id] = currentStatus;
    }

    memoryCache.initialized = true;

    return res.status(200).json({
      success: true,
      monitorsChecked: monitors.length,
      statusChangesProcessed: changes.length,
      changes,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Vercel cron error:", err);
    return res.status(500).json({ error: err.message });
  }
}
