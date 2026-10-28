# RoleFlow Status Bot (BetterStack Relay)

A lightweight 24/7 background worker configured for **Render.com**. It continuously polls BetterStack's monitors & incident APIs, checks RoleFlow maintenance mode, and relays branded Discord alerts with root-cause extraction.

---

## 🚀 1-Click Deployment on Render

You can deploy this as either a **Background Worker** or a **Web Service** on Render.

### Option A: Deploy via Blueprint (Easiest)
1. Go to your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** -> **Blueprint**.
3. Connect your repository: `https://github.com/Jordan123456789097654/roleflow-status-bot.git`.
4. Render will automatically detect `render.yaml`.
5. Enter the two secret environment variables:
   - `BETTERSTACK_API_TOKEN`
   - `DISCORD_WEBHOOK_URL`
6. Click **Apply**.

---

### Option B: Deploy as a Background Worker Manually
1. On Render, click **New +** -> **Background Worker**.
2. Connect `roleflow-status-bot`.
3. Fill in the build & run settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Add the **Environment Variables**:
   ```env
   BETTERSTACK_API_TOKEN=MXuYEq5B3HrrDxPpGqaVeET9
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/1565118574358569040/76tZFS50x1mz7w5uFLQhSGgJaZWaB-Bt98Vsq-2K_6j8HNWvoxaKPwin6hCiFZ_pZtMp
   DISCORD_ROLE_ID=1565074386866802788
   STATUS_PAGE_URL=https://status.roleflow.site
   APP_URL=https://roleflow.site
   POLL_INTERVAL_SECONDS=30
   ```
5. Click **Create Background Worker**.

---

## 🔔 Features
- **24/7 Active Polling**: Runs every 30 seconds continuously in the background.
- **Auto-Maintenance Sync**: Detects when Maintenance Mode is switched on or off in RoleFlow's Founder Admin console and posts custom reason embeds.
- **Incident Root Cause**: Extracts failure error codes (`Status 502`, `Status 404`, `Timeout`) or defaults to `unknown`.
- **Role Ping**: Automatically pings `<@&1565074386866802788>` during disruptions and maintenance.
