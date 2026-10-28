# RoleFlow Status Bot (BetterStack Relay)

A serverless status relay engineered for **Vercel Cron** or standalone Node.js environments. It checks BetterStack's live monitor and incident endpoints, extracting root causes and sending branded Discord alerts.

---

## ⚡ Deployment on Vercel

1. **Import this repository** in your [Vercel Dashboard](https://vercel.com/new).
2. Add the following **Environment Variables** in Vercel Project Settings:
   - `BETTERSTACK_API_TOKEN`: Your BetterStack API v2 token (`MXuY...`)
   - `DISCORD_WEBHOOK_URL`: Your Discord webhook URL
   - `DISCORD_ROLE_ID`: `1565074386866802788` (Pings on downtime)
   - `STATUS_PAGE_URL`: `https://status.roleflow.site`
3. Click **Deploy**.
4. Vercel will automatically configure the cron job from `vercel.json` (`/api/cron` running every minute) to monitor your site 24/7 with zero server costs!

---

## 🔔 Discord Alert Features

- **Failure Reasons**: Extracts exact error codes (`Status 502`, `Status 404`, `Timeout`) or defaults to `unknown`.
- **Role Ping**: Automatically pings `<@&1565074386866802788>` on outage / service disruption events.
- **Auto Recovery**: Posts clean green embeds when services return to operational state without spamming role pings.
