# Base de donnees MongoDB

## Connexion

- **URI** : variable `MONGO_URI` (defaut: `mongodb://localhost:27017`)
- **Base** : variable `MONGO_DB` (defaut: `game3026`)

## Collections

### `cells`

Stocke toutes les cellules decouvertes lors des deplacements (`ship:move`).
Chaque cellule est upsertee par son `id` (pas de doublons).

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

**Index recommandes :**

```js
db.cells.createIndex({ id: 1 }, { unique: true })
db.cells.createIndex({ x: 1, y: 1 }, { unique: true })
```
