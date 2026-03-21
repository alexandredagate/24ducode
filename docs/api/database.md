# Base de donnees MongoDB

## Connexion

- **URI** : variable `MONGO_URI` (defaut: `mongodb://localhost:27017`)
- **Base** : variable `MONGO_DB` (defaut: `game3026`)

## Collections

### `cells`

Stocke toutes les cellules decouvertes lors des deplacements (`ship:move`).
Chaque cellule est upsertee par ses coordonnees `{x, y}` (pas de doublons).

| Champ  | Type     | Description                          |
|--------|----------|--------------------------------------|
| `id`   | `string` | Identifiant unique de la cellule     |
| `x`    | `number` | Position horizontale                 |
| `y`    | `number` | Position verticale                   |
| `type` | `string` | Type de terrain : `SEA`, `SAND` |
| `zone` | `number` | Zone a laquelle appartient la cellule |

**Exemple de document :**

```json
{
  "id": "7fd566c8-dbfa-4620-933d-3462e0e5519c",
  "x": 0,
  "y": -6,
  "type": "SEA",
  "zone": 1
}
```

**Index :**

```js
db.cells.createIndex({ id: 1 }, { unique: true })
db.cells.createIndex({ x: 1, y: 1 }, { unique: true })
```

---

### `ship_position`

Stocke la derniere position connue du bateau pour chaque joueur. Mise a jour a chaque `ship:move`.

| Champ           | Type     | Description                                   |
|-----------------|----------|-----------------------------------------------|
| `codingGameId`  | `string` | Identifiant du joueur                         |
| `position`      | `Cell`   | Derniere position connue `{id, x, y, type, zone}` |
| `energy`        | `number` | Energie restante                              |
| `updatedAt`     | `Date`   | Date de la derniere mise a jour               |

**Exemple de document :**

```json
{
  "codingGameId": "410c8b64-913f-46eb-8bc0-7a197c4f506d",
  "position": { "id": "0fa50f7b-...", "x": 0, "y": -5, "type": "SEA", "zone": 1 },
  "energy": 83,
  "updatedAt": "2026-03-21T17:45:00.000Z"
}
```

**Index :** upsert par `codingGameId` (un seul document par joueur).
