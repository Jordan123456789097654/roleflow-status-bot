require("dotenv").config();

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const STATUS_PAGE_URL = process.env.STATUS_PAGE_URL || "https://status.roleflow.site";
const NOTIFY_ROLE_ID = process.env.DISCORD_ROLE_ID || "1565074386866802788";

async function sendMergedTestPreview() {
  console.log("Sending sample MERGED 3-monitor outage embed with 1 single ping to Discord...");

  const mockOutages = [
    {
      name: "RoleFlow API & Database Health",
      url: "https://roleflow.site/api/health",
      currentStatus: "down",
      reason: "Status 502 — Bad Gateway",
    },
    {
      name: "RoleFlow Frontend (Landing Page)",
      url: "https://roleflow.site/",
      currentStatus: "down",
      reason: "Status 502 — Bad Gateway",
    },
    {
      name: "RoleFlow Browse Openings",
      url: "https://roleflow.site/browse",
      currentStatus: "down",
      reason: "Status 502 — Bad Gateway",
    },
  ];

  const fields = mockOutages.map((item, idx) => ({
    name: `${idx + 1}. ${item.name}`,
    value: `• **Endpoint**: \`${item.url}\`\n• **Status**: \`${item.currentStatus.toUpperCase()}\`\n• **Reason**: \`${item.reason}\``,
    inline: false,
  }));

  fields.push({
    name: "Live Status Page",
    value: `[status.roleflow.site](${STATUS_PAGE_URL})`,
    inline: false,
  });

  const mergedEmbed = {
    title: `🚨 MULTIPLE SERVICES DISRUPTED (${mockOutages.length} Monitors Affected)`,
    url: STATUS_PAGE_URL,
    color: 0xef4444,
    description: `**Infrastructure Incident Detected:** BetterStack probes detected concurrent outages across **${mockOutages.length} endpoints**. SRE investigation initiated.`,
    fields,
    footer: {
      text: "RoleFlow Uptime & SRE Network • Consolidated Multi-Monitor Alert",
      icon_url: "https://roleflow.site/logo.png",
    },
    timestamp: new Date().toISOString(),
  };

  const payload = {
    username: "RoleFlow Status",
    avatar_url: "https://roleflow.site/logo.png",
    content: `<@&${NOTIFY_ROLE_ID}>`,
    allowed_mentions: {
      roles: [NOTIFY_ROLE_ID],
    },
    embeds: [mergedEmbed],
  };

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    console.log("Merged preview embed delivered successfully with 1 ping!");
  } else {
    console.error("Failed to send webhook:", res.status, await res.text());
  }
}

sendMergedTestPreview().catch(console.error);
