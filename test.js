require("dotenv").config();

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const STATUS_PAGE_URL = process.env.STATUS_PAGE_URL || "https://status.roleflow.site";
const NOTIFY_ROLE_ID = process.env.DISCORD_ROLE_ID || "1565074386866802788";

async function sendMaintenancePreview() {
  console.log("Sending sample Auto-Maintenance activation embed to Discord...");

  const maintEmbed = {
    title: "🟡 Scheduled Platform Maintenance in Progress",
    url: STATUS_PAGE_URL,
    color: 0xf59e0b, // Amber Gold
    description:
      "**Platform Maintenance Activated:** RoleFlow has entered scheduled maintenance mode. Public submission queues and candidate portals are temporarily locked while upgrades are applied.",
    fields: [
      {
        name: "Reason / Maintenance Scope",
        value: "`Upgrading PostgreSQL database clusters & Discord bot shards. Expected downtime: ~15 minutes.`",
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

  const payload = {
    username: "RoleFlow Status",
    avatar_url: "https://roleflow.site/logo.png",
    content: `<@&${NOTIFY_ROLE_ID}>`,
    allowed_mentions: {
      roles: [NOTIFY_ROLE_ID],
    },
    embeds: [maintEmbed],
  };

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    console.log("Auto-maintenance preview delivered to Discord!");
  } else {
    console.error("Failed to send webhook:", res.status, await res.text());
  }
}

sendMaintenancePreview().catch(console.error);
