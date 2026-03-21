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

| Commande            | Auth requise | Description                          |
|---------------------|:------------:|--------------------------------------|
| `auth:login`        | Non          | Authentification avec codingGameId   |
| `auth:refresh`      | Non          | Renouveler les tokens JWT            |
| `auth:logout`       | Non          | Deconnexion                          |
| `player:details`    | Oui          | Details du joueur                    |
| `player:resources`  | Oui          | Ressources du joueur                 |
| `ship:move`         | Oui          | Deplacer un bateau                   |
| `map:grid`          | Non          | Recuperer la carte complete           |

---

## Commandes en detail

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

**Reponse erreur (codingGameId invalide) :**
```json
{
  "command": "auth:login",
  "status": "error",
  "error": "Request failed with status code 401"
}
```

**Reponse erreur (champ manquant) :**
```json
{
  "command": "auth:login",
  "status": "error",
  "error": "codingGameId is required"
}
```

---

### `auth:refresh`

Renouvelle les tokens a partir d'un `refreshToken` valide.

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
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Reponse erreur :**
```json
{
  "command": "auth:refresh",
  "status": "error",
  "error": "jwt expired"
}
```

---

### `auth:logout`

Deconnecte le joueur de la session socket.

**Requete :**
```json
{
  "command": "auth:logout"
}
```

**Reponse :**
```json
{
  "command": "auth:logout",
  "status": "ok"
}
```

---

### `player:details`

Recupere les informations detaillees du joueur depuis l'API du jeu.

**Requete :**
```json
{
  "command": "player:details"
}
```

**Reponse succes :**
```json
{
  "command": "player:details",
  "status": "ok",
  "data": {
    "id": "f243e889-d35f-48ef-9ee0-e48813ddd7ef",
    "name": "Joueur 1",
    "quotient": 200,
    "money": 900,
    "resources": [
      { "quantity": 1600, "type": "FERONIUM" },
      { "quantity": 1800, "type": "BOISIUM" },
      { "quantity": 1800, "type": "CHARBONIUM" }
    ],
    "home": {
      "name": "Little Garden",
      "bonusQuotient": 0
    },
    "discoveredIslands": [
      {
        "island": { "name": "Little Garden", "bonusQuotient": 0 },
        "islandState": "KNOWN"
      }
    ],
    "marketPlaceDiscovered": false
  }
}
```

**Reponse erreur (non authentifie) :**
```json
{
  "command": "player:details",
  "status": "error",
  "error": "UNAUTHORIZED: please auth:login first"
}
```

---

### `player:resources`

Recupere les ressources actuelles du joueur.

**Requete :**
```json
{
  "command": "player:resources"
}
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

**Reponse erreur (non authentifie) :**
```json
{
  "command": "player:resources",
  "status": "error",
  "error": "UNAUTHORIZED: please auth:login first"
}
```

---

### `ship:move`

Deplace un bateau dans une direction donnee.

**Directions valides :** `N`, `S`, `E`, `W`, `NE`, `NW`, `SE`, `SW`

**Requete :**
```json
{
  "command": "ship:move",
  "payload": {
    "direction": "N"
  }
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
    "position": {
      "id": "0fa50f7b-...", "x": 0, "y": -5, "type": "SEA", "zone": 1
    },
    "energy": 83
  }
}
```

**Reponse erreur (direction invalide) :**
```json
{
  "command": "ship:move",
  "status": "error",
  "error": "Invalid direction \"UP\". Must be one of: N, S, E, W, NE, NW, SE, SW"
}
```

**Reponse erreur (non authentifie) :**
```json
{
  "command": "ship:move",
  "status": "error",
  "error": "UNAUTHORIZED: please auth:login first"
}
```

**Effet secondaire :** apres chaque `ship:move` reussi, les cellules decouvertes sont sauvegardees en MongoDB et un evenement `map:update` est **broadcast a tous les clients connectes** (voir section Evenements serveur).

---

### `map:grid`

Recupere la carte complete sous forme de grille. Chaque cellule est representee par un caractere :
- `0` = mer (SEA)
- `1` = terre (SAND, ROCKS)
- ` ` (espace) = zone inconnue

**Requete :**
```json
{
  "command": "map:grid"
}
```

**Reponse succes :**
```json
{
  "command": "map:grid",
  "status": "ok",
  "data": {
    "grid": [
      "  000  ",
      " 00100 ",
      "0011100",
      " 00100 ",
      "  000  "
    ],
    "minX": -3,
    "maxX": 3,
    "minY": -2,
    "maxY": 2,
    "width": 7,
    "height": 5
  }
}
```

**Reponse succes (aucune cellule decouverte) :**
```json
{
  "command": "map:grid",
  "status": "ok",
  "data": {
    "grid": [],
    "minX": 0,
    "maxX": 0,
    "minY": 0,
    "maxY": 0,
    "width": 0,
    "height": 0
  }
}
```

La grille se lit ligne par ligne du `minY` au `maxY`, chaque caractere representant une colonne de `minX` a `maxX`.

---

## Evenements serveur (broadcast)

Ces evenements sont emis par le serveur **a tous les clients** sans qu'ils aient besoin de les demander.

### `map:update`

Emis a **tous les clients connectes** apres chaque `ship:move` reussi. Contient la carte mise a jour.

**Evenement :** `map:update`

```json
{
  "command": "map:update",
  "status": "ok",
  "data": {
    "grid": ["00000", "00110", "00100"],
    "minX": -2,
    "maxX": 2,
    "minY": -1,
    "maxY": 1,
    "width": 5,
    "height": 3
  }
}
```

> Dans Postman : ajouter un listener sur `map:update` dans la section **Events** pour recevoir les mises a jour automatiques.

---

## Flux d'utilisation typique

```
1. Se connecter au WebSocket
2. Ecouter les evenements "response" et "map:update"
3. auth:login        -> obtenir accessToken + refreshToken
4. map:grid          -> recuperer la carte actuelle
5. player:details    -> voir les infos du joueur
6. player:resources  -> voir les ressources
7. ship:move         -> deplacer le bateau (declenche un map:update broadcast)
8. ... repeter 5-7 ...
9. auth:refresh      -> renouveler les tokens si expiration
10. auth:logout      -> se deconnecter
```

## Tokens JWT

| Token          | Duree par defaut | Usage                                 |
|----------------|:----------------:|---------------------------------------|
| `accessToken`  | 15 min           | Authentification au handshake         |
| `refreshToken` | 1 jour           | Renouvellement via `auth:refresh`     |

Les secrets et durees sont configurables via les variables d'environnement `ACCESS_SECRET`, `REFRESH_SECRET`, `ACCESS_TTL` et `REFRESH_TTL`.

## Tester avec Postman

1. Ouvrir Postman -> **New** -> **Socket.IO**
2. URL : `http://localhost:3001`
3. Se connecter
4. Dans **Events** -> ajouter des listeners sur `response` et `map:update`
5. Envoyer les messages sur l'evenement `message` (defaut)

## Base de donnees

Les cellules decouvertes sont stockees dans MongoDB (collection `cells`).
Chaque cellule est identifiee par son `id` et mise a jour via upsert (pas de doublons).

Variables d'environnement :
- `MONGO_URI` — URI de connexion MongoDB (defaut: `mongodb://localhost:27017`)
- `MONGO_DB` — nom de la base (defaut: `game3026`)
