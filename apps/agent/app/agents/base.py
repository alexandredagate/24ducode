"""Base agent — infrastructure commune à toutes les versions."""
import logging
from abc import ABC, abstractmethod

from app.config import settings
from app.db import MongoClient
from app.world import WorldMap
from app.ws_client import SocketIOClient

logger = logging.getLogger(__name__)

# Cell types considered as "island" — adjust if the game uses different values.
ISLAND_CELL_TYPES: frozenset[str] = frozenset({"SAND"})


def is_island(cell: dict) -> bool:
    return cell.get("type") in ISLAND_CELL_TYPES


class BaseAgent(ABC):
    def __init__(
        self,
        ws: SocketIOClient,
        db: MongoClient | None = None,
    ) -> None:
        self.ws = ws
        self.world = WorldMap(db) if db is not None else None

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def run(self) -> None:
        logger.info("🌐 Connexion au serveur de jeu: %s", settings.api_url)
        await self.ws.connect(settings.api_url)
        logger.info("🔐 Authentification en cours")
        await self._authenticate()

        details = await self._send("player:details")
        if details.get("status") == "ok":
            logger.info("🧑‍✈️ Joueur : %s", details["data"].get("name", "?"))

        if self.world:
            await self.world.refresh()
            logger.info(
                "🗺️  Carte chargée : %s cellules, %s îles connues",
                self.world.cell_count,
                self.world.island_count,
            )

        await self.loop()

    @abstractmethod
    async def loop(self) -> None:
        """Boucle de jeu — chaque version implémente sa propre logique."""
        ...

    # ------------------------------------------------------------------
    # Shared helpers
    # ------------------------------------------------------------------

    async def _authenticate(self) -> None:
        resp = await self.ws.send_command(
            "auth:login", {"codingGameId": settings.coding_game_id}
        )
        if resp.get("status") != "ok":
            raise RuntimeError(f"auth:login échoué : {resp.get('error')}")
        self.ws.set_tokens(resp["data"]["accessToken"],
                           resp["data"]["refreshToken"])
        logger.info("✅ Authentifié")

    async def _send(self, command: str, payload: dict | None = None) -> dict:
        """Send a command, refreshing tokens automatically on UNAUTHORIZED."""
        logger.debug("Commande envoyée: %s", command)
        resp = await self.ws.send_command(command, payload)
        if resp.get("status") == "error" and "UNAUTHORIZED" in resp.get("error", ""):
            logger.info("🔑 Token expiré — tentative de refresh")
            if self.ws._refresh_token:
                refresh = await self.ws.send_command(
                    "auth:refresh", {"refreshToken": self.ws._refresh_token}
                )
                if refresh.get("status") == "ok":
                    self.ws.set_tokens(
                        refresh["data"]["accessToken"],
                        refresh["data"]["refreshToken"],
                    )
                    resp = await self.ws.send_command(command, payload)
        return resp

    async def _handle_fine(self) -> bool:
        """Tente de payer les amendes DUE. Retourne True si au moins une a été payée."""
        taxes_resp = await self._send("tax:list", {"status": "DUE"})
        if taxes_resp.get("status") != "ok":
            logger.warning("💰 Impossible de récupérer les taxes : %s", taxes_resp.get("error"))
            return False

        taxes = taxes_resp.get("data", [])
        if not taxes:
            logger.info("💰 Aucune amende DUE trouvée")
            return False

        details_resp = await self._send("player:details")
        if details_resp.get("status") != "ok":
            logger.warning("💰 Impossible de récupérer le solde : %s", details_resp.get("error"))
            return False

        money = details_resp["data"].get("money", 0)
        paid_any = False

        for tax in taxes:
            amount = tax.get("amount", 0)
            tax_id = tax.get("id")
            if amount > money:
                logger.warning(
                    "💰 Solde insuffisant pour l'amende %s (coût=%s, solde=%s)",
                    tax_id, amount, money,
                )
                continue
            pay_resp = await self._send("tax:pay", {"taxId": tax_id})
            if pay_resp.get("status") == "ok":
                money -= amount
                paid_any = True
                logger.info("💰 Amende %s payée (%s) — solde restant : %s", tax_id, amount, money)
            else:
                logger.warning("💰 Échec paiement amende %s : %s", tax_id, pay_resp.get("error"))

        return paid_any
