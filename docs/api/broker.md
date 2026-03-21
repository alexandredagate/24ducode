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

La connexion au broker est hardcodee dans `apps/api/services/broker.ts` (URL AMQP, queue dediee).

## Connexion

- Protocole : **AMQP** (port 5672)
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
