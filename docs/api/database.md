# Base de donnees MongoDB

## Connexion

- **URI** : variable `MONGO_URI` (defaut: Atlas cloud, voir `.env`)
- **Base** : variable `MONGO_DB` (defaut: `ek24-database`)

## Collections

### `cells`

Stocke toutes les cellules decouvertes lors des deplacements (`ship:move`).
Chaque cellule est upsertee par ses coordonnees `{x, y}` (pas de doublons).

| Champ             | Type     | Description                                        |
|-------------------|----------|----------------------------------------------------|
| `id`              | `string` | Identifiant unique de la cellule                   |
| `x`               | `number` | Position horizontale                               |
| `y`               | `number` | Position verticale                                 |
| `type`            | `string` | Type de terrain : `SEA`, `SAND`                    |
| `zone`            | `number` | Zone a laquelle appartient la cellule              |
| `note`            | `string` | Optionnel : `"HOME"` ou `"TRAD"` (lieux speciaux) |
| `discoveryStatus` | `string` | Optionnel : `"DISCOVERED"` ou `"KNOWN"`            |

**Exemple de document :**

```json
{
  "id": "7fd566c8-dbfa-4620-933d-3462e0e5519c",
  "x": 5,
  "y": 3,
  "type": "SAND",
  "zone": 1,
  "note": "HOME",
  "discoveryStatus": "KNOWN"
}
```

**Index :**

```js
db.cells.createIndex({ id: 1 }, { unique: true })
db.cells.createIndex({ x: 1, y: 1 }, { unique: true })
```

**Lieux speciaux (ALWAYS_KNOWN) :**

| Coordonnees | Note   | Toujours KNOWN |
|-------------|--------|----------------|
| `(5, 3)`    | `HOME` | Oui            |

---

### `ship_position`

Stocke la derniere position connue du bateau pour chaque joueur. Mise a jour a chaque `ship:move`.

| Champ          | Type     | Description                                              |
|----------------|----------|----------------------------------------------------------|
| `codingGameId` | `string` | Identifiant du joueur                                    |
| `position`     | `Cell`   | Derniere position (enrichie avec `note`, `discoveryStatus`) |
| `energy`       | `number` | Energie restante                                         |
| `updatedAt`    | `Date`   | Date de la derniere mise a jour                          |

**Index :** upsert par `codingGameId` (un seul document par joueur).

---

### `confirmed_refuel`

Stocke les coordonnees des cellules SAND ou un rechargement de fuel a ete confirme (l'energie du bateau a augmente en arrivant sur cette cellule). C'est la **seule source de verite** pour savoir quelles iles rechargent le fuel.

| Champ         | Type     | Description                       |
|---------------|----------|-----------------------------------|
| `x`           | `number` | Coordonnee X de la cellule        |
| `y`           | `number` | Coordonnee Y de la cellule        |
| `confirmedAt` | `Date`   | Date de la confirmation du refuel  |

**Index :** `{ x: 1, y: 1 }` — unique

**Seeding au demarrage de l'API :**
- HOME (5,3) est toujours inseree
- Toutes les cellules SAND avec `discoveryStatus: "KNOWN"` sont copiees dans cette collection

**Utilisation :**
- L'API retourne `confirmedRefuel` dans la reponse `map:grid`
- Le jeu 3D utilise cette liste pour colorer les iles (vert = confirmee, orange = non confirmee)
- L'agent utilise cette liste pour choisir ses iles de ravitaillement
