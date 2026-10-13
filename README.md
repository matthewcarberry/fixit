# Fixit

A small, self-hosted help desk for the people in your home.

Family members report things that need fixing (the wifi is down, there's a leak, ants in the kitchen) from their phone, with photos. You triage, reply, and track each ticket until it's done. It borrows the useful parts of Zendesk, JIRA and ServiceNow and leaves out the enterprise weight.

It runs as a single Docker container, so it fits on an Unraid server, a NAS or any machine with Docker.

## Features

- **Phone-first web app** that installs to the home screen like a native app
- **Tickets** with title, details, optional category, urgency, location and photos
- **Statuses:** New, In progress, Waiting on requester, Waiting on parts, Resolved, Closed
- **Conversation** on every ticket, with private internal notes only the admin sees
- **Full history** of every status, priority and field change
- **Queue** for the admin, sortable by priority, due date or age, filterable by status and category, with search
- **Push notifications** on phones and desktops; optional email
- **Automatic follow-up:**
  - Resolved tickets close after 2 days unless reopened
  - Waiting on requester tickets remind the requester every 24 hours and close after 5 reminders (5 days) with no reply
  - A reply from the requester moves the ticket back to In progress and stops the reminders
- **Privacy:** requesters only ever see their own tickets
- **Security:** invite-only accounts, Argon2 password hashing, lockout after repeated failed sign-ins, strict browser security headers
- **Light and dark mode**

## Roles

| Role | Can do |
| --- | --- |
| Requester | Submit tickets, reply, add photos, confirm a fix or reopen |
| Admin | Everything: work all tickets, change status, priority, category and due date, write internal notes, manage people and categories |

## Install

### Unraid

See the [Unraid guide](docs/unraid.md). In short: add the container from the template in [`unraid/fixit.xml`](unraid/fixit.xml), open the web UI, and create your admin account. Maintainers: [publishing to Community Applications](docs/community-applications.md).

### Docker Compose

```yaml
services:
  fixit:
    image: ghcr.io/matthewcarberry/fixit:latest
    container_name: fixit
    ports:
      - "8585:8080"
    volumes:
      - ./fixit-data:/config
    environment:
      FIXIT_PUBLIC_URL: https://fixit.example.com
      TZ: America/New_York
    restart: unless-stopped
```

Then open `http://<server>:8585` and create the admin account. The first person to open a fresh install becomes the admin, so do this right away.

### HTTPS is needed for phones

Browsers only allow push notifications and home-screen install on HTTPS sites. Put Fixit behind a reverse proxy with a real certificate (Nginx Proxy Manager, Caddy, Traefik, Cloudflare Tunnel) and set `FIXIT_PUBLIC_URL` to that address. On iPhone, notifications work once Fixit is added to the Home Screen (Share, then Add to Home Screen). Passkeys (Settings, then Add a passkey) also need the https address.

## Configuration

All settings are environment variables. Only the data folder is required.

| Variable | Default | What it does |
| --- | --- | --- |
| `FIXIT_PUBLIC_URL` | (empty) | The https address people use. Used in notification links, and passkeys belong to this address. |
| `TZ` | `UTC` | Time zone for logs. |
| `FIXIT_TICKET_PREFIX` | `HOME` | Ticket numbers look like `HOME-42`. |
| `FIXIT_RESOLVED_AUTOCLOSE_HOURS` | `48` | Hours before a Resolved ticket closes on its own. |
| `FIXIT_WAITING_REMINDER_HOURS` | `24` | Hours between reminders while Waiting on requester. |
| `FIXIT_WAITING_MAX_REMINDERS` | `5` | Reminders (the status change counts as the first) before the ticket closes. |
| `FIXIT_MAX_UPLOAD_MB` | `15` | Largest photo allowed. |
| `FIXIT_SESSION_DAYS` | `90` | How long a device stays signed in without being used. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | (empty) | Optional email: ticket updates and a welcome email for new people. Email turns on when `SMTP_HOST` and `SMTP_FROM` are set. |
| `PUID`, `PGID` | `99`, `100` | User and group the app runs as (Unraid's defaults). |
| `PORT` | `8080` | Port inside the container. |

Everything Fixit stores lives in `/config`: the SQLite database (`fixit.db`), uploaded photos (`uploads/`) and generated push keys. Back up that folder.

## Development

Requires Node.js 22 and pnpm 10.

```sh
pnpm install
pnpm dev          # API on :8080, web app on :5173 with hot reload
pnpm test         # server tests
pnpm build && pnpm test:e2e   # end-to-end tests in a phone-sized browser
```

For local development, set `FIXIT_DATA_DIR=./data` so the database isn't written to `/config`.

Project layout:

```
apps/server     Fastify API, SQLite (Drizzle ORM), scheduler, push and email
apps/web        React web app (Vite, Tailwind, installable PWA)
apps/e2e        Playwright end-to-end tests
packages/shared Types, constants and validation shared by server and clients
unraid/         Unraid Community Applications template
```

The shared package is there so the planned iOS and Android apps (React Native) can reuse the same types and validation.

## Releases

Pushing a tag like `v0.2.0` builds the image and publishes it to `ghcr.io/matthewcarberry/fixit` with the tags `0.2.0`, `0.2` and `latest`.

## License

[MIT](LICENSE)
