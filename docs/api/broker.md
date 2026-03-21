# Broker de messages (AMQP)

## Vue d'ensemble

Le serveur API se connecte au broker AMQP (Amazon MQ / RabbitMQ) du jeu 3026.
Tous les evenements recus depuis le broker sont automatiquement redistribues a **tous les clients Socket.IO** connectes via l'evenement `broker:event`.

```
Broker AMQP (jeu 3026)         Serveur API             Clients Socket.IO
        |                          |                          |
        |--- message queue ------->|                          |
        |                          |--- emit("broker:event") -->| (tous les clients)
        |                          |                          |
```

## Configuration

| Variable        | Description                                       | Exemple                                                        |
|-----------------|---------------------------------------------------|----------------------------------------------------------------|
| `BROKER_HOST`   | Hostname du broker                                | `b-a5095b9b-3c4d-4fe7-8df1-8031e8808618.mq.eu-west-3.on.aws` |
| `BROKER_PORT`   | Port AMQPS                                        | `5671`                                                         |
| `BROKER_USER`   | Nom d'equipe (espaces remplaces par `_`)          | `Mon_Equipe`                                                   |
| `BROKER_PASS`   | codingGameId de l'equipe                          | `eyJhbGciOiJIUzI1NiIs...`                                     |
| `BROKER_QUEUE`  | Queue dediee au joueur                            | `user.eyJhbGciOiJIUzI1NiIs...`                                |

Les 3 variables `BROKER_USER`, `BROKER_PASS` et `BROKER_QUEUE` sont obligatoires. Si elles sont absentes, le broker est ignore au demarrage.

## Connexion

- Protocole : **AMQPS** (AMQP over TLS, port 5671)
- Reconnexion automatique toutes les 5 secondes en cas de deconnexion
- Les messages sont acquittes (ack) apres traitement

## Evenement Socket.IO

### `broker:event`

Chaque message recu depuis la queue AMQP est parse en JSON (si possible) et emis a tous les clients.

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

Le format exact depend du jeu — le serveur transmet le message tel quel sans transformation.

## Ecouter dans Postman

Dans Postman Socket.IO, ajouter un listener sur l'evenement `broker:event` dans la section **Events**.

## Types d'evenements connus

Les evenements publies par le jeu incluent (non exhaustif) :

- Nouvelles offres marketplace
- Ventes effectuees
- Decouvertes d'iles
- Vols en cours / resolus
- Taxes emises
