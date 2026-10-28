const API_TOKEN = process.env.BETTERSTACK_API_TOKEN;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const STATUS_PAGE_URL = process.env.STATUS_PAGE_URL || "https://status.roleflow.site";
const NOTIFY_ROLE_ID = process.env.DISCORD_ROLE_ID || "1565074386866802788";
const APP_URL = process.env.APP_URL || "https://roleflow.site";

let memoryCache = {
  monitors: {},
  maintenance: {
    enabled: null,
    message: "",
  },
  initialized: false,
};

async function postDiscordWebhook(payload) {
  try {
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

// Builds a single consolidated embed when multiple monitors change at once
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
    color: 0xef4444, // Red
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
    color: 0x22c55e, // Green
    description: `**Systems Operational:** Probes are successfully returning HTTP 200 OK. Latency and health metrics have stabilized.`,
    fields,
    footer: {
      text: "RoleFlow Uptime & SRE Network • Service Recovery",
      icon_url: "https://roleflow.site/logo.png",
    },
    timestamp: new Date().toISOString(),
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

        if (memoryCache.maintenance.enabled !== null && memoryCache.maintenance.enabled !== currentEnabled) {
          const maintEmbed = createMaintenanceEmbed(currentEnabled, currentMsg);
          await postDiscordWebhook({
            username: "RoleFlow Status",
            avatar_url: "https://roleflow.site/logo.png",
            content: currentEnabled && NOTIFY_ROLE_ID ? `<@&${NOTIFY_ROLE_ID}>` : "",
            allowed_mentions: { roles: [NOTIFY_ROLE_ID] },
            embeds: [maintEmbed],
          });
          changes.push({ type: "MAINTENANCE_TOGGLE", enabled: currentEnabled, reason: currentMsg });
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
    const incidentMap = {};
    for (const inc of incidentsData.data || []) {
      const attrs = inc.attributes;
      if (attrs.status === "Ongoing" || attrs.status === "Started") {
        incidentMap[attrs.url] = attrs.cause || "unknown";
      }
    }

    const pendingOutages = [];
    const pendingRecoveries = [];

    for (const m of monitors) {
      const id = m.id;
      const attrs = m.attributes;
      const currentStatus = attrs.status;
      const previousStatus = memoryCache.monitors[id];

      if (memoryCache.initialized && previousStatus && previousStatus !== currentStatus) {
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

        changes.push(record);
      }

      memoryCache.monitors[id] = currentStatus;
    }

    memoryCache.initialized = true;

    // --- DISPATCH CONSOLIDATED WEBHOOKS ---
    // If multiple monitors went DOWN, send exactly 1 combined embed with 1 ping
    if (pendingOutages.length > 0) {
      const embed = createConsolidatedOutageEmbed(pendingOutages);
      await postDiscordWebhook({
        username: "RoleFlow Status",
        avatar_url: "https://roleflow.site/logo.png",
        content: NOTIFY_ROLE_ID ? `<@&${NOTIFY_ROLE_ID}>` : "",
        allowed_mentions: { roles: [NOTIFY_ROLE_ID] },
        embeds: [embed],
      });
    }

    // If multiple monitors RECOVERED, send exactly 1 combined embed without pinging
    if (pendingRecoveries.length > 0) {
      const embed = createConsolidatedRecoveryEmbed(pendingRecoveries);
      await postDiscordWebhook({
        username: "RoleFlow Status",
        avatar_url: "https://roleflow.site/logo.png",
        content: "",
        embeds: [embed],
      });
    }

    return res.status(200).json({
      success: true,
      monitorsChecked: monitors.length,
      outagesMerged: pendingOutages.length,
      recoveriesMerged: pendingRecoveries.length,
      changes,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Vercel cron error:", err);
    return res.status(500).json({ error: err.message });
  }
}
