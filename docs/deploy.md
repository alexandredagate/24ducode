# Deploiement (Fly.io)

## Prerequis

- [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) installe
- Authentifie avec `fly auth login`

## API

Fichier de config : `fly.toml` (racine du projet)

```bash
# Premier deploiement (creation de l'app)
fly launch --no-deploy

# Configurer les secrets
fly secrets set \
  MONGO_URI="mongodb+srv://..." \
  MONGO_DB="ek24-database" \
  ACCESS_SECRET="change-me" \
  REFRESH_SECRET="change-me" \
  ACCESS_TTL="15m" \
  REFRESH_TTL="2d"

# Deployer
fly deploy
```

URL : https://24ducode-api.fly.dev

**Logs :**
```bash
fly logs -a 24ducode-api
```

## Dashboard

Fichier de config : `apps/dash/fly.toml`

```bash
# Premier deploiement (creation de l'app)
fly launch --config apps/dash/fly.toml --no-deploy

# Deployer (l'URL de l'API est bakee dans le build Next.js via fly.toml build.args)
fly deploy --config apps/dash/fly.toml
```

URL : https://24ducode-dash.fly.dev

**Logs :**
```bash
fly logs -a 24ducode-dash
```

## Game (Vite + Babylon.js)

Le jeu 3D tourne en local uniquement (pas deploye sur Fly.io).

```bash
# Dev local
cd apps/game
npm run dev
# → http://localhost:5173
```

Se connecte a l'API prod via `SERVER_URL` dans `apps/game/src/services/socket.ts`.

## Agent (Python FastAPI)

Le bot d'exploration autonome. Tourne en local via Docker.

```bash
# Docker
docker compose up -d agent

# Ou dev local
cd apps/agent
uv run uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

Se connecte a l'API via `API_URL` dans `.env`. Health check : `http://localhost:8080/health`

## Notes

- API et Dashboard tournent en region `cdg` (Paris) sur Fly.io
- L'API ecoute sur le port `3001`, le dash sur le port `3000`
- Le Game ecoute sur le port `5173` (local)
- L'Agent ecoute sur le port `8080` (local/Docker)
- Le dash se connecte a l'API via `NEXT_PUBLIC_API_URL` (configure dans `apps/dash/fly.toml` build args)
- Le game se connecte a l'API prod directement (`SERVER_URL` hardcode)
- L'agent se connecte a l'API via `API_URL` dans `.env`
- Pour redeploy apres un changement de code : `fly deploy` (API) ou `fly deploy --config apps/dash/fly.toml` (dash)
