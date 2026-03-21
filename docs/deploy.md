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

## Notes

- Les deux apps tournent en region `cdg` (Paris)
- L'API ecoute sur le port `3001`, le dash sur le port `3000`
- Le dash se connecte a l'API via `NEXT_PUBLIC_API_URL` (configure dans `apps/dash/fly.toml` build args)
- Pour redeploy apres un changement de code : `fly deploy` (API) ou `fly deploy --config apps/dash/fly.toml` (dash)
