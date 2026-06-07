# Flipbets

Discord gambling casino + web SPA with LTC deposits, 9-tier ranks, live games, and admin panel.

## Stack
- Node.js + Express (single process runs both bot + web)
- MongoDB (Mongoose)
- Discord.js v14
- Apirone LTC API
- Provably fair games

## Local Development

```bash
cp .env.example .env
# fill in MONGO, DISCORD, APIRONE keys
npm install
npm run dev
```

Runs on `http://localhost:3000`

## Deploy to Render (Free)

See [DEPLOY.md](./DEPLOY.md) or just:

1. Push this repo to GitHub
2. Go to https://render.com → New → Web Service
3. Connect your repo
4. Render auto-detects `render.yaml` — just confirm
5. Add env vars (or use Sync from .env)
6. Deploy!

Free tier: spins down after 15min idle (cold start ~30s on first request).

## Project Structure
```
Flipbets/
├── bot.js                 # Discord bot entry
├── start.js               # Single-process launcher (bot + web)
├── config.js              # Env config
├── models/                # Mongoose models
├── commands/              # Discord bot commands
├── utils/                 # Shared helpers (apirone, ranks, etc)
└── web/
    ├── server.js          # Express server
    └── public/            # Static SPA
        ├── index.html
        ├── css/style.css
        └── js/app.js
```

## Environment Variables

| Var | Required | Notes |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB Atlas connection |
| `DISCORD_TOKEN` | Yes | Bot token |
| `DISCORD_CLIENT_ID` | Yes | OAuth app |
| `DISCORD_CLIENT_SECRET` | Yes | OAuth app |
| `DISCORD_REDIRECT_URI` | Yes | `https://yourapp.com/auth/discord/callback` |
| `APIRONE_ACCOUNT_ID` | Yes | For LTC deposits |
| `APIRONE_TRANSFER_KEY` | Yes | For LTC withdrawals |
| `SESSION_SECRET` | Yes | Cookie signing (use `openssl rand -hex 32`) |
| `OWNER_ID` | Yes | Your Discord user ID (admin) |
| `PORT` | No | Default 3000 |
