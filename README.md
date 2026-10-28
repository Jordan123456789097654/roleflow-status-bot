# RoleFlow Status & BetterStack Relay Bot

An autonomous microservice that polls the **BetterStack API v2** on the free tier and relays live status updates, incident publications, and service recoveries into Discord using branded embeds.

---

## 🛠 Features

- **Free-Tier Friendly**: Bypasses BetterStack's paid outgoing webhook restriction by polling their official REST API.
- **Branded Discord Embeds**: Formats uptime recoveries (🟢), service disruptions (🔴), and maintenance windows (🟡) with official RoleFlow branding, direct links to `status.roleflow.site`, and ISO timestamps.
- **Persistent State**: Maintains `state.json` so you never get spammed with duplicate notifications upon server restarts.
- **Configurable Polling**: Easily adjust poll frequency (default: 30 seconds).

---

## 🚀 Quick Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure `.env`**:
   ```env
   BETTERSTACK_API_TOKEN=your_betterstack_api_token
   DISCORD_WEBHOOK_URL=your_discord_webhook_url
   POLL_INTERVAL_SECONDS=30
   STATUS_PAGE_URL=https://status.roleflow.site
   ```

3. **Send a Test Webhook**:
   ```bash
   npm run test-webhook
   ```

4. **Run Live Daemon**:
   ```bash
   npm start
   ```

---

## 🌐 24/7 Hosting Options

You can host this standalone project on free or low-cost services:
- **Render.com / Railway / Koyeb**: Deploy as a background worker.
- **VPS / Linux Server**: Run with `pm2 start index.js --name "roleflow-status"`.
