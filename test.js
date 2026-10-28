require("dotenv").config();

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const STATUS_PAGE_URL = process.env.STATUS_PAGE_URL || "https://status.roleflow.site";

async function sendTestPreview() {
  console.log("Sending sample test status embed to Discord...");

  const sampleEmbed = {
    title: "🟢 RoleFlow API & Database Health: OPERATIONAL",
    url: STATUS_PAGE_URL,
    color: 0x22c55e, // Emerald green
    description: "**All Systems Operational:** Real-time health check passed. API latency is optimal (42ms) and PostgreSQL database connections are responding with zero packet loss.",
    fields: [
      {
        name: "Endpoint URL",
        value: "`https://roleflow.site/api/health`",
        inline: true,
      },
      {
        name: "Monitored Service",
        value: "`Core API & Database`",
        inline: true,
      },
      {
        name: "Current State",
        value: "`UP (200 OK)`",
        inline: true,
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
    console.log("Sample test webhook successfully sent! Check your Discord channel.");
  } else {
    console.error("Failed to send webhook:", res.status, await res.text());
  }
}

sendTestPreview().catch(console.error);
