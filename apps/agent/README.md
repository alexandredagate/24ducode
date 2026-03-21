# agent

Service FastAPI Python — exploration, OR, MongoDB.

- **Port** : `8080`
- **Runtime** : Python 3.12, [uv](https://docs.astral.sh/uv/), FastAPI + Uvicorn
- **DB** : MongoDB via Motor (async)

---

## Structure

```
apps/agent/
├── Dockerfile
├── pyproject.toml      ← dépendances du projet
├── uv.lock             ← lockfile généré (à committer)
└── app/
    ├── __init__.py
    ├── main.py         ← app FastAPI, lifespan, routes
    ├── config.py       ← settings via pydantic-settings + .env
    └── db.py           ← client Motor abstrait
```

---

## Développement local

### Prérequis

- [`uv`](https://docs.astral.sh/uv/getting-started/installation/) installé (`brew install uv` ou `curl -Lsf https://astral.sh/uv/install.sh | sh`)

### Installer l'environnement

```bash
cd apps/agent
uv sync          # crée .venv et installe toutes les dépendances (prod + dev)
```

### Lancer le serveur en hot-reload

```bash
uv run uvicorn app.main:app --reload --port 8080
```

---

## Gestion des dépendances (uv)

| Action | Commande |
|---|---|
| Ajouter un paquet | `uv add <paquet>` |
| Ajouter une dép dev | `uv add --dev <paquet>` |
| Supprimer un paquet | `uv remove <paquet>` |
| Mettre à jour un paquet | `uv add <paquet>@latest` |
| Tout mettre à jour | `uv lock --upgrade && uv sync` |
| Régénérer le lockfile | `uv lock` |
| Synchroniser le .venv | `uv sync` |

> **Règle** : toujours committer `uv.lock` après un `uv add` / `uv remove`. Le Dockerfile en dépend (`--frozen`).

---

## Docker

### Build de l'image seule

```bash
# depuis la racine du monorepo
docker build -t ek24_agent -f apps/agent/Dockerfile apps/agent
```

### Lancer uniquement l'agent

```bash
docker compose up agent
```

### Lancer tout le stack

```bash
docker compose up
```

### Reconstruire après un changement de dépendances

```bash
docker compose build agent
docker compose up agent
```

### Accéder aux logs

```bash
docker compose logs -f agent
```

### Ouvrir un shell dans le conteneur

```bash
docker compose exec agent bash
```

---

## Variables d'environnement

Gérées par le `docker-compose.yml` en production. En local, créer un fichier `.env` dans `apps/agent/` (ignoré par git) :

```env
MONGO_URI=mongodb://localhost:27017
MONGO_DB=game3026
API_TIMEOUT=10.0
```

---

## Tests

```bash
uv run pytest
```

---

## Endpoints

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/` | Sanity check |
| `GET` | `/health` | Ping MongoDB |
| `WS` | `/ws` | WebSocket echo |
