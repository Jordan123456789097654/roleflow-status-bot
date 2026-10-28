require("dotenv").config();

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const STATUS_PAGE_URL = process.env.STATUS_PAGE_URL || "https://status.roleflow.site";

async function sendTestPreview() {
  console.log("Sending sample test status embed with Reason field to Discord...");

  const sampleEmbed = {
    title: "🔴 RoleFlow API & Database Health: SERVICE DISRUPTED / DOWN",
    url: STATUS_PAGE_URL,
    color: 0xef4444, // Crimson Red
    description: "**Service Disruption Detected:** An outage or degraded performance has been detected by the uptime probe.",
    fields: [
      {
        name: "Endpoint URL",
        value: "`https://roleflow.site/api/health`",
        inline: true,
      },
      {
        name: "Current State",
        value: "`DOWN`",
        inline: true,
      },
      {
        name: "Failure Reason / Root Cause",
        value: "`Status 502 — Bad Gateway`",
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

  const payload = {
    username: "RoleFlow Status",
    avatar_url: "https://roleflow.site/logo.png",
    embeds: [sampleEmbed],
  };

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    console.log("Sample test webhook successfully delivered to Discord!");
  } else {
    console.error("Failed to send webhook:", res.status, await res.text());
  }
}

sendTestPreview().catch(console.error);
