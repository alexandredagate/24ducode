# 3026 — Contexte complet pour Claude Code

## Vue d'ensemble

Jeu de type "24h du code" — hackathon. En l'an 3026, 404 ans après l'impact de l'astéroïde "status-302", la Terre s'est fragmentée en milliers d'îles. On contrôle une civilisation sur une île de départ, on explore la carte maritime, on découvre de nouvelles îles, on commerce et on progresse.

**Base URL de l'API** : `http://ec2-15-237-116-133.eu-west3.compute.amazonaws.com:8443`

**Authentification** : Header `codinggame-id` avec le token JWT (codingGameId) obtenu lors de l'inscription. Ce token est non expirable et unique à l'équipe.

---

## Objectifs principaux

- Découvrir un maximum d'îles (augmente la production de ressource principale)
- Résoudre un maximum de quêtes
- Cartographier la carte du monde
- Visualiser les informations en temps réel
- Coopérer avec les autres joueurs (marketplace)

---

## Concepts clés

### La carte

- Grille de cellules avec coordonnées `(x, y)` et une `zone`
- Types de cellules : `SEA` (océan), `SAND` (plage/île), `ROCKS` (récifs/obstacle)
- Chaque cellule appartient à une `zone` (entier)
- On peut se déplacer sur les cellules SEA et SAND sans contrainte

### Les ressources

| Ressource    | Type             | Description                                      |
|--------------|------------------|--------------------------------------------------|
| BOISIUM      | Primaire         | Ressource extractible                            |
| FERONIUM     | Primaire         | Ressource extractible                            |
| CHARBONIUM   | Primaire         | Ressource extractible                            |
| OR           | Monnaie          | Utilisée pour les transactions, taxes, upgrades  |

- Chaque civilisation extrait **une seule** des 3 ressources primaires (déterminée à l'inscription)
- La ressource principale est collectée **automatiquement toutes les 5 minutes**
- La quantité produite dépend du **nombre d'îles découvertes** (quotient de productivité)
- Les 2 autres ressources doivent être obtenues via la **MarketPlace**

### L'entrepôt (storage)

- Limite la capacité de stockage pour chaque ressource primaire (l'or est exclu)
- **Si l'entrepôt est plein, les ressources reçues sont définitivement perdues**
- Il faut upgrader le storage pour augmenter la capacité
- Chaque upgrade coûte des ressources (FERONIUM, BOISIUM, CHARBONIUM)

### Le bateau

- Il faut d'abord le construire via `/ship/build` (retourne un `shipId` à conserver)
- Placé automatiquement le long de la côte de l'île de départ
- Niveaux 1 à 5 (radeau → meilleur navire)
- Caractéristiques par niveau : `visibilityRange`, `maxMovement`, `speed`
- Chaque amélioration coûte des ressources + or

### Déplacement

- Directions possibles : `N`, `S`, `E`, `W`, `NE`, `NW`, `SE`, `SW`
- Chaque déplacement d'une case coûte **1 point de mouvement**
- Énergie = points de mouvement restants
- **Recharge** : approcher le bateau d'une île **déjà découverte lors d'une expédition précédente** (pas l'expédition en cours)
- **Panne sèche** : 0 énergie en mer → bateau immobilisé → remorquage vers île de départ → taxe RESCUE
  - Si pas assez d'or → remorquage gratuit mais avec un long délai d'attente

### Découverte d'îles

- Une île est "vue" quand au moins une de ses cellules SAND entre dans le champ de vision du bateau
- **Pour valider la découverte** : le bateau doit **retourner sur une cellule SAND** de l'île de départ ou d'une île déjà connue (pas juste à côté, **dessus**)
- Si le bateau tombe en panne avant de valider → toutes les découvertes de l'expédition sont perdues
- Chaque île découverte augmente le `quotient` de productivité de la ressource principale
- **Bonus OR** : le premier joueur à découvrir une île reçoit un gros bonus en or, le deuxième moins, etc.

### États des cellules (CellState)

| État     | Description                                                                 |
|----------|-----------------------------------------------------------------------------|
| VISITED  | Le bateau a déjà visité/aperçu cette case, même sans valider la découverte |
| SEEN     | Le bateau a vu cette case dans le trajet actuel                             |
| KNOWN    | Le bateau a vu cette case ET a validé la découverte en rentrant à quai      |

### Zones à risques

- Certaines zones contiennent des dangers : tempêtes, pirates, kraken, récifs, etc.
- **20% de chances** de subir un risque à chaque déplacement dans une zone dangereuse
- Si touché : panne immédiate + taxe de secours (RESCUE)

### Taxes / Amendes

| Type   | Cause                                          |
|--------|------------------------------------------------|
| RESCUE | Panne sèche, tempête, remorquage               |
| CHEAT  | Action non autorisée                            |

- États : `DUE` (à payer) ou `PAID` (payée)
- Consultables et payables via l'API `/taxes`

### MarketPlace

- Permet l'échange de ressources entre joueurs
- **Prérequis** : avoir découvert et validé l'île du Marché Central
- Une seule offre active à la fois par joueur
- À la mise en ligne d'une offre, les ressources sont **immédiatement débitées**
- Délai avant modification d'une offre
- On peut acheter tout ou partie d'une offre d'un autre joueur

### Vols (Thefts)

- Permet de lancer des pirates pour voler des ressources à d'autres joueurs
- Cible automatiquement le joueur le plus riche sur la ressource ciblée
- Coûte de l'or (`moneySpent`)
- Résolution différée (champ `resolveAt`)
- Chance de réussite : `FAIBLE`, `MOYENNE`, `FORTE`

### Broker de messages (AMQP / RabbitMQ)

- Endpoint : `b-a5095b9b-3c4d-4fe7-8df1-8031e8808618.mq.eu-west3.on.aws:5671`
- Username : `<nom_de_l_equipe>` (espaces remplacés par `_`)
- Password : `<id_equipe>` (le codingGameId)
- Queue : `user.<id_equipe>`
- Reçoit les messages publics (tous les joueurs) + messages privés de l'équipe
- Événements publiés : nouvelles offres marketplace, etc.

---

## API — Référence complète

### Registration

#### POST `/signupcodes`
Inscrit l'équipe et génère un signup code.

**Request body** :
```json
{ "mail": "email@example.com" }
```

**Response 200** :
```json
{ "signupCode": "eyJhbGciOiJIUzI1NiIs..." }
```

#### POST `/players/register`
Crée l'équipe avec un nom. Retourne le `codingGameId` (token secret).

**Header requis** : `codinggame-signupcode: <signupCode reçu par mail>`

**Request body** :
```json
{ "name": "MonEquipe" }
```

**Response 200** :
```json
{
  "name": "MonEquipe",
  "codingGameId": "token-secret-jwt"
}
```

> Le nom d'équipe doit être alphanumérique (sans accents), seuls les espaces sont autorisés.

---

### Player

#### GET `/players/details`
Retourne les détails complets du joueur.

**Auth** : `codinggame-id: <codingGameId>`

**Response 200** :
```json
{
  "id": "uuid",
  "signUpCode": "jwt...",
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
    {
      "island": { "name": "Little Garden", "bonusQuotient": 0 },
      "islandState": "KNOWN"
    }
  ],
  "marketPlaceDiscovered": false
}
```

#### GET `/resources`
Retourne l'état des stocks de ressources.

**Auth** : `codinggame-id: <codingGameId>`

**Response 200** :
```json
[
  { "quantity": 200, "type": "BOISIUM" }
]
```

---

### Ship

#### POST `/ship/build`
Construit le premier bateau. Placé automatiquement sur la côte de l'île de départ.

**Auth** : `codinggame-id: <codingGameId>`

**Response 201** :
```json
{ "shipId": "8966f75f-0e9f-4695-a3cc-c412d09bcc10" }
```

> **Conserver le shipId** pour toutes les opérations suivantes.

#### POST `/ship/move`
Déplace le bateau dans une direction.

**Auth** : `codinggame-id: <codingGameId>`

**Request body** :
```json
{ "direction": "E" }
```

Directions possibles : `N`, `S`, `E`, `W`, `NE`, `NW`, `SE`, `SW`

**Response 200** :
```json
{
  "discoveredCells": [
    {
      "id": "uuid",
      "x": 0, "y": -6,
      "type": "SEA",
      "zone": 1,
      "ships": []
    }
  ],
  "position": {
    "id": "uuid",
    "x": 0, "y": -5,
    "type": "SEA",
    "zone": 1,
    "ships": []
  },
  "energy": 83
}
```

Les `discoveredCells` contiennent toutes les cellules visibles autour du bateau après le mouvement. Le champ `ships` dans chaque cellule peut contenir les bateaux d'autres joueurs.

**Response 400** : Mouvement refusé.
```json
{ "codeError": "GAME_OVER_INSERT_COINS", "message": "..." }
```

#### GET `/ship/next-level`
Récupère les infos du prochain niveau de bateau (caractéristiques + coût).

**Auth** : `codinggame-id: <codingGameId>`

**Response 200** : Objet `Ship` avec `costResources` et `level`.

#### PUT `/ship/upgrade`
Améliore le bateau au niveau spécifié.

**Auth** : `codinggame-id: <codingGameId>`

**Request body** :
```json
{ "level": 2 }
```

---

### Storage

#### GET `/storage/next-level`
Récupère les infos du prochain niveau d'entrepôt.

**Auth** : `codinggame-id: <codingGameId>`

**Response 200** :
```json
{
  "id": 2,
  "name": "Cabane",
  "maxResources": { "FERONIUM": 5000, "BOISIUM": 2500, "CHARBONIUM": 2500 },
  "costResources": { "FERONIUM": 100, "BOISIUM": 50, "CHARBONIUM": 50 }
}
```

#### PUT `/storage/upgrade`
Améliore l'entrepôt au prochain niveau.

**Auth** : `codinggame-id: <codingGameId>`

**Response 200** : Objet `Storage` avec les nouvelles capacités.

---

### Taxes

#### GET `/taxes`
Liste les taxes du joueur. Filtrable par statut.

**Auth** : `codinggame-id: <codingGameId>`

**Query param optionnel** : `status=DUE` ou `status=PAID`

**Response 200** :
```json
[
  {
    "id": "uuid",
    "type": "RESCUE",
    "state": "DUE",
    "amount": 100,
    "remainingTime": 300,
    "player": { "id": "uuid", "name": "Joueur 1" }
  }
]
```

#### PUT `/taxes/{taxId}`
Paye une taxe spécifique.

**Auth** : `codinggame-id: <codingGameId>`

**Response 200** : Taxe payée.

---

### MarketPlace

> **Prérequis** : `marketPlaceDiscovered: true` dans les détails du joueur.

#### GET `/marketplace/offers`
Liste toutes les offres en cours.

**Auth** : `codinggame-id: <codingGameId>`

**Response 200** :
```json
[
  {
    "id": "uuid",
    "owner": { "name": "admin" },
    "resourceType": "BOISIUM",
    "quantityIn": 1000,
    "pricePerResource": 1
  }
]
```

#### POST `/marketplace/offers`
Crée une nouvelle offre de vente.

**Auth** : `codinggame-id: <codingGameId>`

**Request body** :
```json
{
  "resourceType": "CHARBONIUM",
  "quantityIn": 1000,
  "pricePerResource": 2
}
```

> Les ressources sont **immédiatement débitées** à la mise en ligne. Une seule offre active à la fois. Délai avant modification.

#### GET `/marketplace/offers/{id}`
Consulte une offre spécifique.

#### PATCH `/marketplace/offers/{id}`
Met à jour une offre (quantité et/ou prix uniquement, après le délai).

**Request body** :
```json
{
  "resourceType": "CHARBONIUM",
  "quantityIn": 500,
  "pricePerResource": 3
}
```

#### DELETE `/marketplace/offers/{id}`
Supprime une offre.

#### POST `/marketplace/purchases`
Achète une offre (ou une partie).

**Auth** : `codinggame-id: <codingGameId>`

**Request body** :
```json
{
  "quantity": 100,
  "offerId": "uuid-de-l-offre"
}
```

**Response 201** : Achat validé.

---

### Thefts (Vols)

#### GET `/thefts`
Liste tous les vols (en cours et passés).

**Auth** : `codinggame-id: <codingGameId>`

**Response 200** :
```json
[
  {
    "id": "uuid",
    "resourceType": "FERONIUM",
    "amountAttempted": 0,
    "moneySpent": 2000,
    "createdAt": "2026-03-18T11:52:07.558829",
    "resolveAt": "2026-03-18T12:12:07.558771",
    "status": "PENDING",
    "chance": "FORTE"
  }
]
```

#### POST `/thefts/player`
Lance une attaque pirate sur le joueur le plus riche pour la ressource ciblée.

**Auth** : `codinggame-id: <codingGameId>`

**Request body** :
```json
{
  "resourceType": "BOISIUM",
  "moneySpent": 300
}
```

- Plus on investit d'or, plus la chance de réussite est élevée (FAIBLE / MOYENNE / FORTE)
- Le vol est résolu après un délai (`resolveAt`)

---

## Schémas de données clés

### Cell
```
{ id: string, x: int, y: int, type: "SEA"|"SAND"|"ROCKS", zone: int }
```

### ShipLevel
```
{ id: int, name: string, visibilityRange: int, maxMovement: int, speed: int }
```

### PriceResources
```
{ FERONIUM: int, BOISIUM: int, CHARBONIUM: int }
```

### Island
```
{ name: string, bonusQuotient: int }
```

### DiscoveredIsland
```
{ island: Island, islandState: "KNOWN"|"DISCOVERED" }
```

---

## Stratégies et pièges à éviter

1. **Toujours calculer l'aller-retour** avant de partir en expédition — ne jamais consommer plus de la moitié de son énergie avant de faire demi-tour
2. **Upgrader le storage tôt** pour ne pas perdre de ressources
3. **Explorer vite** pour les bonus OR de première découverte
4. **Valider en rentrant SUR une cellule SAND** d'une île connue, pas juste à côté
5. **Surveiller les taxes DUE** pour éviter les blocages
6. **Brancher le broker AMQP** pour réagir en temps réel aux événements (offres marketplace, etc.)
7. **Coopérer via la marketplace** — c'est le seul moyen d'obtenir les 2 ressources qu'on ne produit pas
8. **Zones dangereuses = 20% de risque par case** — évaluer si le raccourci vaut le coup
9. **Le champ `ships` dans les cellules** permet de repérer les autres joueurs
10. **Conserver le shipId** retourné par `/ship/build` — indispensable pour la suite