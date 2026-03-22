# API WebSocket - Documentation

## Vue d'ensemble

Le serveur API expose un serveur **Socket.IO v4** sur le port `3001` (par defaut).
Toute la communication passe par un unique evenement `message` (client -> serveur) et `response` (serveur -> client).

```
Client                          Serveur
  |                                |
  |--- connect() ----------------->|  (handshake, middleware auth)
  |                                |
  |--- emit("message", payload) -->|  (route selon "command")
  |<-- emit("response", result) ---|
  |                                |
  |<-- emit("map:update", grid) ---|  (broadcast a TOUS les clients apres un ship:move)
  |                                |
  |<-- emit("ship:position", pos) -|  (broadcast a TOUS les clients apres un ship:move)
  |                                |
  |<-- emit("broker:event", msg) --|  (broadcast depuis le broker AMQP du jeu)
  |                                |
```

## Connexion

```
URL : http://localhost:3001
Transport : websocket
```

La connexion est autorisee sans token. Le middleware d'authentification accepte les connexions non authentifiees pour permettre l'appel a `auth:login`.

Si un `accessToken` est fourni au handshake, il est verifie automatiquement :

```json
{
  "auth": {
    "token": "<accessToken>"
  }
}
```

## Format des messages

### Client -> Serveur (evenement `message`)

```typescript
{
  "command": CommandName,
  "payload"?: object
}
```

### Serveur -> Client (evenement `response`)

**Succes :**
```typescript
{
  "command": CommandName,
  "status": "ok",
  "data"?: object
}
```

**Erreur :**
```typescript
{
  "command": CommandName,
  "status": "error",
  "error": string
}
```

### Commandes disponibles

| Commande                     | Auth | Description                                    |
|------------------------------|:----:|------------------------------------------------|
| `auth:login`                 | Non  | Authentification avec codingGameId             |
| `auth:refresh`               | Non  | Renouveler les tokens JWT                      |
| `auth:logout`                | Non  | Deconnexion                                    |
| `player:details`             | Oui  | Details du joueur                              |
| `player:resources`           | Oui  | Ressources du joueur                           |
| `ship:build`                 | Oui  | Construire un bateau                           |
| `ship:move`                  | Oui  | Deplacer un bateau                             |
| `ship:location`              | Oui  | Position actuelle du bateau                    |
| `ship:next-level`            | Oui  | Infos du prochain niveau du bateau             |
| `ship:upgrade`               | Oui  | Ameliorer le bateau                            |
| `tax:list`                   | Oui  | Lister les taxes                               |
| `tax:pay`                    | Oui  | Payer une taxe                                 |
| `storage:next-level`         | Oui  | Infos du prochain niveau d'entrepot            |
| `storage:upgrade`            | Oui  | Ameliorer l'entrepot                           |
| `marketplace:offers`         | Oui  | Lister les offres du marketplace               |
| `marketplace:offer`          | Oui  | Consulter une offre                            |
| `marketplace:create-offer`   | Oui  | Creer une offre                                |
| `marketplace:update-offer`   | Oui  | Modifier une offre                             |
| `marketplace:delete-offer`   | Oui  | Supprimer une offre                            |
| `marketplace:purchase`       | Oui  | Acheter une offre                              |
| `theft:list`                 | Oui  | Lister ses vols                                |
| `theft:attack`               | Oui  | Lancer un vol sur un joueur                    |
| `map:grid`                   | Non  | Recuperer la carte complete                    |
| `admin:reset-discovery`      | Non  | Reset tous les discoveryStatus (admin)         |

---

## Auth

### `auth:login`

Authentifie le joueur en validant son `codingGameId` aupres de l'API du jeu.

**Requete :**
```json
{
  "command": "auth:login",
  "payload": {
    "codingGameId": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Reponse succes :**
```json
{
  "command": "auth:login",
  "status": "ok",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Erreurs possibles :**
- `"codingGameId is required"`
- `"Request failed with status code 401"` (codingGameId invalide)

---

### `auth:refresh`

**Requete :**
```json
{
  "command": "auth:refresh",
  "payload": {
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Reponse succes :**
```json
{
  "command": "auth:refresh",
  "status": "ok",
  "data": {
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

---

### `auth:logout`

**Requete :**
```json
{ "command": "auth:logout" }
```

**Reponse :**
```json
{ "command": "auth:logout", "status": "ok" }
```

---

## Player

### `player:details`

**Requete :**
```json
{ "command": "player:details" }
```

**Reponse succes :**
```json
{
  "command": "player:details",
  "status": "ok",
  "data": {
    "id": "f243e889-...",
    "name": "Joueur 1",
    "quotient": 200,
    "money": 900,
    "resources": [
      { "quantity": 1600, "type": "FERONIUM" },
      { "quantity": 1800, "type": "BOISIUM" },
      { "quantity": 1800, "type": "CHARBONIUM" }
    ],
    "home": { "name": "Little Garden", "bonusQuotient": 0 },
    "discoveredIslands": [
      { "island": { "name": "Little Garden", "bonusQuotient": 0 }, "islandState": "KNOWN" }
    ],
    "marketPlaceDiscovered": false
  }
}
```

---

### `player:resources`

**Requete :**
```json
{ "command": "player:resources" }
```

**Reponse succes :**
```json
{
  "command": "player:resources",
  "status": "ok",
  "data": [
    { "quantity": 1600, "type": "FERONIUM" },
    { "quantity": 1800, "type": "BOISIUM" },
    { "quantity": 1800, "type": "CHARBONIUM" }
  ]
}
```

---

## Ship

### `ship:build`

Construit un bateau. Il sera place le long d'une cote de l'ile de depart.

**Requete :**
```json
{ "command": "ship:build" }
```

**Reponse succes :**
```json
{
  "command": "ship:build",
  "status": "ok",
  "data": {
    "shipId": "8966f75f-0e9f-4695-a3cc-c412d09bcc10"
  }
}
```

---

### `ship:move`

**Directions valides :** `N`, `S`, `E`, `W`, `NE`, `NW`, `SE`, `SW`

**Requete :**
```json
{
  "command": "ship:move",
  "payload": { "direction": "N" }
}
```

**Reponse succes :**
```json
{
  "command": "ship:move",
  "status": "ok",
  "data": {
    "discoveredCells": [
      { "id": "7fd566c8-...", "x": 0, "y": -6, "type": "SEA", "zone": 1 }
    ],
    "position": { "id": "0fa50f7b-...", "x": 0, "y": -5, "type": "SEA", "zone": 1 },
    "energy": 83
  }
}
```

**Effets secondaires :**
- Les cellules decouvertes sont sauvegardees en MongoDB (collection `cells`)
- Les nouvelles cellules SAND sont marquees `discoveryStatus: "DISCOVERED"` (sauf HOME → `"KNOWN"`)
- Si le bateau arrive sur une ile SAND et que l'energie augmente → la cellule est ajoutee a `confirmed_refuel`
- Si le bateau arrive sur une ile SAND deja KNOWN → `validateDiscoveries()` passe toutes les DISCOVERED → KNOWN
- La position du bateau est sauvegardee en MongoDB (collection `ship_position`)
- Un `map:update` est broadcast a tous les clients (avec `notes`, `islands`, `confirmedRefuel`)
- Un `ship:position` est broadcast a tous les clients avec position enrichie (`note`, `discoveryStatus`) et `validated` (nombre de cellules validees si applicable)

---

### `ship:location`

Retourne la derniere position connue du bateau (stockee en DB). Necessite au moins un `ship:move` prealable.

**Requete :**
```json
{ "command": "ship:location" }
```

**Reponse succes :**
```json
{
  "command": "ship:location",
  "status": "ok",
  "data": {
    "position": { "id": "0fa50f7b-...", "x": 0, "y": -5, "type": "SEA", "zone": 1 },
    "energy": 83
  }
}
```

**Erreurs possibles :**
- `"No position known yet — move the ship first"`

---

### `ship:next-level`

Informations sur le prochain niveau du bateau et son cout.

**Requete :**
```json
{ "command": "ship:next-level" }
```

**Reponse succes :**
```json
{
  "command": "ship:next-level",
  "status": "ok",
  "data": {
    "availableMove": 3,
    "level": { "id": 2, "name": "caravelle", "visibilityRange": 2, "maxMovement": 8, "speed": 2 },
    "currentPosition": { "id": "...", "x": 0, "y": -4, "type": "SEA", "zone": 1 },
    "costResources": { "FERONIUM": 500, "BOISIUM": 250, "CHARBONIUM": 250 }
  }
}
```

---

### `ship:upgrade`

Ameliore le bateau au niveau specifie.

**Requete :**
```json
{
  "command": "ship:upgrade",
  "payload": { "level": 2 }
}
```

**Reponse succes :**
```json
{ "command": "ship:upgrade", "status": "ok" }
```

---

## Taxes

### `tax:list`

Liste les taxes. Filtre optionnel par statut.

**Requete :**
```json
{ "command": "tax:list" }
```

**Requete avec filtre :**
```json
{
  "command": "tax:list",
  "payload": { "status": "DUE" }
}
```

**Reponse succes :**
```json
{
  "command": "tax:list",
  "status": "ok",
  "data": [
    {
      "id": "95355542-...",
      "type": "RESCUE",
      "state": "DUE",
      "amount": 100,
      "remainingTime": 300,
      "player": { "id": "62982b8e-...", "name": "Joueur 1" }
    }
  ]
}
```

---

### `tax:pay`

**Requete :**
```json
{
  "command": "tax:pay",
  "payload": { "taxId": "95355542-..." }
}
```

**Reponse succes :**
```json
{ "command": "tax:pay", "status": "ok" }
```

---

## Storage

### `storage:next-level`

Informations sur le prochain niveau d'entrepot.

**Requete :**
```json
{ "command": "storage:next-level" }
```

**Reponse succes :**
```json
{
  "command": "storage:next-level",
  "status": "ok",
  "data": {
    "id": 2,
    "name": "Cabane",
    "maxResources": { "FERONIUM": 5000, "BOISIUM": 2500, "CHARBONIUM": 2500 },
    "costResources": { "FERONIUM": 100, "BOISIUM": 50, "CHARBONIUM": 50 }
  }
}
```

---

### `storage:upgrade`

**Requete :**
```json
{ "command": "storage:upgrade" }
```

**Reponse succes :**
```json
{
  "command": "storage:upgrade",
  "status": "ok",
  "data": {
    "id": 2,
    "name": "Cabane",
    "maxResources": { "FERONIUM": 5000, "BOISIUM": 2500, "CHARBONIUM": 2500 },
    "costResources": { "FERONIUM": 100, "BOISIUM": 50, "CHARBONIUM": 50 }
  }
}
```

---

## Marketplace

### `marketplace:offers`

Liste toutes les offres en cours.

**Requete :**
```json
{ "command": "marketplace:offers" }
```

**Reponse succes :**
```json
{
  "command": "marketplace:offers",
  "status": "ok",
  "data": [
    {
      "id": "345707cf-...",
      "owner": { "name": "admin" },
      "resourceType": "BOISIUM",
      "quantityIn": 1000,
      "pricePerResource": 1
    }
  ]
}
```

---

### `marketplace:offer`

Consulter une offre par son id.

**Requete :**
```json
{
  "command": "marketplace:offer",
  "payload": { "offerId": "345707cf-..." }
}
```

**Reponse succes :**
```json
{
  "command": "marketplace:offer",
  "status": "ok",
  "data": {
    "id": "345707cf-...",
    "owner": { "name": "admin" },
    "resourceType": "BOISIUM",
    "quantityIn": 1000,
    "pricePerResource": 1
  }
}
```

---

### `marketplace:create-offer`

Mettre une offre en vente.

**Requete :**
```json
{
  "command": "marketplace:create-offer",
  "payload": {
    "resourceType": "CHARBONIUM",
    "quantityIn": 1000,
    "pricePerResource": 2
  }
}
```

**Reponse succes :**
```json
{
  "command": "marketplace:create-offer",
  "status": "ok",
  "data": {
    "id": "new-offer-id",
    "owner": { "name": "Joueur 1" },
    "resourceType": "CHARBONIUM",
    "quantityIn": 1000,
    "pricePerResource": 2
  }
}
```

---

### `marketplace:update-offer`

Modifier la quantite et/ou le prix d'une offre.

**Requete :**
```json
{
  "command": "marketplace:update-offer",
  "payload": {
    "offerId": "345707cf-...",
    "resourceType": "CHARBONIUM",
    "quantityIn": 500,
    "pricePerResource": 3
  }
}
```

**Reponse succes :**
```json
{
  "command": "marketplace:update-offer",
  "status": "ok",
  "data": { "id": "345707cf-...", "resourceType": "CHARBONIUM", "quantityIn": 500, "pricePerResource": 3 }
}
```

---

### `marketplace:delete-offer`

**Requete :**
```json
{
  "command": "marketplace:delete-offer",
  "payload": { "offerId": "345707cf-..." }
}
```

**Reponse succes :**
```json
{ "command": "marketplace:delete-offer", "status": "ok" }
```

---

### `marketplace:purchase`

Acheter une offre.

**Requete :**
```json
{
  "command": "marketplace:purchase",
  "payload": {
    "offerId": "345707cf-...",
    "quantity": 100
  }
}
```

**Reponse succes :**
```json
{
  "command": "marketplace:purchase",
  "status": "ok",
  "data": { "offerId": "345707cf-...", "quantity": 100 }
}
```

---

## Thefts (Vols)

### `theft:list`

Liste tous les vols (en cours et passes).

**Requete :**
```json
{ "command": "theft:list" }
```

**Reponse succes :**
```json
{
  "command": "theft:list",
  "status": "ok",
  "data": [
    {
      "id": "21b06126-...",
      "resourceType": "FERONIUM",
      "amountAttempted": 0,
      "moneySpent": 2000,
      "createdAt": "2026-03-18T11:52:07.558829",
      "resolveAt": "2026-03-18T12:12:07.558771",
      "status": "PENDING",
      "chance": "FORTE"
    }
  ]
}
```

---

### `theft:attack`

Lancer un vol sur le joueur le plus riche en la ressource ciblee.

**Requete :**
```json
{
  "command": "theft:attack",
  "payload": {
    "resourceType": "BOISIUM",
    "moneySpent": 300
  }
}
```

**Reponse succes :**
```json
{
  "command": "theft:attack",
  "status": "ok",
  "data": {
    "id": "21b06126-...",
    "resourceType": "BOISIUM",
    "amountAttempted": 0,
    "moneySpent": 300,
    "createdAt": "2026-03-21T15:00:00",
    "resolveAt": "2026-03-21T15:20:00",
    "status": "PENDING",
    "chance": "MOYENNE"
  }
}
```

---

## Map

### `map:grid`

Recupere la carte complete sous forme de grille :
- `0` = vide / inconnu
- `1` = mer (SEA)
- `2` = terre (SAND)

**Requete :**
```json
{ "command": "map:grid" }
```

**Reponse succes :**
```json
{
  "command": "map:grid",
  "status": "ok",
  "data": {
    "grid": ["0011100", "0112210", "1122211", "0112210", "0011100"],
    "minX": -3, "maxX": 3,
    "minY": -2, "maxY": 2,
    "width": 7, "height": 5,
    "notes": [{ "x": 5, "y": 3, "note": "HOME" }],
    "islands": [{ "x": 5, "y": 3, "zone": 1, "discoveryStatus": "KNOWN" }],
    "confirmedRefuel": [{ "x": 5, "y": 3 }]
  }
}
```

---

### `admin:reset-discovery`

Reset tous les `discoveryStatus` des cellules SAND en DB. Toutes passent a `DISCOVERED` sauf HOME (5,3) qui reste `KNOWN`. Broadcast un `map:update` a tous les clients.

**Requete :**
```json
{ "command": "admin:reset-discovery" }
```

**Reponse succes :**
```json
{
  "command": "admin:reset-discovery",
  "status": "ok",
  "data": { "reset": 242, "home": 1 }
}
```

---

## Evenements serveur (broadcast)

### `map:update`

Emis a **tous les clients connectes** apres chaque `ship:move` reussi.

**Evenement :** `map:update`

```json
{
  "command": "map:update",
  "status": "ok",
  "data": {
    "grid": ["11111", "11221", "11211"],
    "minX": -2, "maxX": 2,
    "minY": -1, "maxY": 1,
    "width": 5, "height": 3
  }
}
```

### `ship:position`

Emis a **tous les clients connectes** apres chaque `ship:move` reussi. Permet de suivre la position du bateau en temps reel.

**Evenement :** `ship:position`

```json
{
  "position": { "id": "0fa50f7b-...", "x": 0, "y": -5, "type": "SEA", "zone": 1, "note": "HOME", "discoveryStatus": "KNOWN" },
  "energy": 83,
  "validated": 5
}
```

> `note` et `discoveryStatus` sont presents si la cellule a ces champs en DB. `validated` est present uniquement quand des cellules DISCOVERED ont ete passees a KNOWN lors de ce move.

### `broker:event`

Emis a **tous les clients connectes** lorsqu'un message arrive du broker AMQP du jeu 3026 (nouvelles offres, vols, decouvertes, etc.).

**Evenement :** `broker:event`

```json
{
  "type": "OFFER_CREATED",
  "data": {
    "id": "345707cf-...",
    "resourceType": "BOISIUM",
    "quantityIn": 1000,
    "pricePerResource": 1
  }
}
```

Le format depend du jeu — le message est transmis tel quel. Voir [broker.md](./broker.md) pour plus de details.

---

## Erreur commune

Toute commande necessitant une authentification renvoie cette erreur si le joueur n'est pas connecte :

```json
{
  "command": "<command>",
  "status": "error",
  "error": "UNAUTHORIZED: please auth:login first"
}
```

---

## Tokens JWT

| Token          | Duree par defaut | Usage                             |
|----------------|:----------------:|-----------------------------------|
| `accessToken`  | 15 min           | Authentification au handshake     |
| `refreshToken` | 1 jour           | Renouvellement via `auth:refresh` |

Configurable via `ACCESS_SECRET`, `REFRESH_SECRET`, `ACCESS_TTL`, `REFRESH_TTL`.

## Tester avec Postman

1. Ouvrir Postman -> **New** -> **Socket.IO**
2. URL : `http://localhost:3001`
3. Se connecter
4. Dans **Events** -> ajouter des listeners sur `response`, `map:update`, `ship:position` et `broker:event`
5. Envoyer les messages sur l'evenement `message` (defaut)

## Base de donnees

3 collections MongoDB :
- `cells` — cellules decouvertes (upsert par `{x, y}`)
- `ship_position` — position du bateau (upsert par `codingGameId`)
- `confirmed_refuel` — cellules SAND ou un refuel a ete confirme (upsert par `{x, y}`)

Variables d'environnement :
- `MONGO_URI` — URI de connexion MongoDB
- `MONGO_DB` — nom de la base (defaut: `ek24-database`)

Voir [database.md](./database.md) pour le schema complet.
