# Running Fixit on Unraid

## 1. Add the container

Until Fixit is listed in Community Applications, add it from the template:

1. In Unraid, go to **Docker**, then **Add Container**.
2. In **Template repositories** (at the bottom of the Docker page), add `https://github.com/matthewcarberry/fixit` and save. Or paste the template URL directly:
   `https://raw.githubusercontent.com/matthewcarberry/fixit/main/unraid/fixit.xml`
3. Pick **Fixit** from the template list.
4. Check the defaults:
   - **Web UI port:** `8585`
   - **Config / data:** `/mnt/user/appdata/fixit`
   - **Time zone:** your own, e.g. `America/Chicago`
   - **Public URL:** leave empty for now; fill it in at step 3
5. Click **Apply**.

Open `http://<unraid-ip>:8585` and create your admin account straight away.

## 2. Add your family

In Fixit, go to **Settings**, then **People**, then **Add a person**. Give each person their email and the starting password you set. They can change it under Settings.

## 3. Reach it from anywhere with Nginx Proxy Manager

You need a domain name pointing at your home. For example, with `fixit.example.com`:

1. **DNS:** create an `A` record for `fixit` pointing at your home's public IP.
   If your IP changes, use dynamic DNS: either point a `CNAME` at a free DuckDNS name kept up to date by the DuckDNS container, or move the domain's DNS to a provider with an API (such as Cloudflare) and run a DDNS updater container.
2. **Router:** forward ports 80 and 443 to Nginx Proxy Manager (usually already done if you use NPM).
3. **Nginx Proxy Manager**, under **Hosts**, then **Proxy Hosts**, then **Add Proxy Host**:
   - **Domain names:** `fixit.example.com`
   - **Scheme:** `http`
   - **Forward hostname / IP:** your Unraid IP
   - **Forward port:** `8585`
   - Turn on **Block common exploits** and **Websockets support**
   - **SSL** tab: request a new Let's Encrypt certificate, and turn on **Force SSL** and **HTTP/2**
4. Back in Unraid, edit the Fixit container and set **Public URL** to `https://fixit.example.com`.

Fixit trusts the `X-Forwarded-*` headers NPM sends, so sign-in cookies are marked secure automatically over HTTPS.

## 4. Turn on notifications on each phone

- **iPhone:** open `https://fixit.example.com` in Safari, tap **Share**, then **Add to Home Screen**. Open Fixit from the new icon, go to **Settings**, and tap **Turn on** under Notifications.
- **Android:** open the site in Chrome, tap **Install app** (or the menu, then **Add to Home screen**), then turn on notifications in Fixit's Settings.

## Backups

Everything is in `/mnt/user/appdata/fixit`. The CA Appdata Backup plugin covers it, or copy the folder while the container is stopped.

## Updating

Fixit publishes a new image for each release. Use **Check for Updates** on the Docker page, or turn on auto-update for the container. Database changes apply automatically on start.
