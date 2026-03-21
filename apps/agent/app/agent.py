"""Agent V1 — exploration avec gestion du carburant.

Stratégie :
- Vecteur de direction aléatoire, renouvelé toutes les N cases.
- Zone 1 : directions cardinales uniquement (N/S/E/W).
- Sécurité carburant : demi-tour dès que énergie ≤ distance directe vers la dernière île.
- Maison par défaut : x=5, y=3 (utilisée si aucune île n'a encore été visitée).
- Mémoire des 200 derniers mouvements.
"""
import asyncio
import logging

from app.config import settings
from app.db import MongoClient
from app.memory import ExplorationMemory, Move
from app.strategy import ExplorationV1Strategy, Strategy
from app.world import WorldMap
from app.ws_client import SocketIOClient

logger = logging.getLogger(__name__)

# Cell types considered as "island" — adjust if the game uses different values.
ISLAND_CELL_TYPES: frozenset[str] = frozenset({"SAND"})


class AgentV1:
    def __init__(
        self,
        ws: SocketIOClient,
        strategy: Strategy | None = None,
        db: MongoClient | None = None,
    ) -> None:
        self.ws = ws
        self.memory = ExplorationMemory(maxlen=200)
        self.strategy = strategy or ExplorationV1Strategy()
        self.world = WorldMap(db) if db is not None else None
        self._returning = False
        self._return_queue: list[str] = []
        self._current_zone: int = 1

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
            ship = await self.world.get_ship_state(settings.coding_game_id)
            if ship:
                pos = ship["position"]
                logger.info("📍 Position restaurée depuis DB : %s", pos)
                self._current_zone = pos["zone"]
                if _is_island(pos):
                    self.memory.mark_island(pos)

        # Assume we start on our home island.
        self.memory.mark_island()
        logger.info("🏝️  Position initiale marquée comme île connue")

        while True:
            direction = self._pick_direction()
            if direction is None:
                self._on_return_complete()
                continue

            logger.debug(
                "🧭 Déplacement choisi: %s | mode_retour=%s | file_retour_restante=%s",
                direction,
                self._returning,
                len(self._return_queue),
            )

            resp = await self._send("ship:move", {"direction": direction})
            if resp.get("status") != "ok":
                error = resp.get("error", "")
                logger.warning("⚠️  ship:move erreur : %s", error)
                if "GAME_OVER_INSERT_COINS" in error or "amende" in error.lower():
                    if settings.auto_pay_fines:
                        paid = await self._handle_fine()
                        if paid:
                            continue  # re-tenter le move immédiatement
                    else:
                        logger.info("💰 Amende détectée mais auto_pay_fines est désactivé")
                elif "zone" in error.lower() and "accéder" in error.lower() and isinstance(self.strategy, ExplorationV1Strategy):
                    logger.info("🚧 Bordure de zone atteinte — demi-tour")
                    self.strategy.reverse_vector()
                await asyncio.sleep(3.0)
                continue

            await self._process_move(direction, resp["data"])
            await asyncio.sleep(3.0)

    # ------------------------------------------------------------------
    # Helpers
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

    def _on_return_complete(self) -> None:
        logger.info("🏝️  Retour terminé — île atteinte, reprise de l'exploration")
        self._returning = False
        if isinstance(self.strategy, ExplorationV1Strategy):
            self.strategy.reset_vector()

    async def _process_move(self, direction: str, data: dict) -> None:
        move = Move(
            direction=direction,
            position=data["position"],
            energy=data["energy"],
            discovered_cells=data.get("discoveredCells", []),
        )
        self.memory.record(move)
        self._current_zone = data["position"]["zone"]

        logger.info(
            "⛵ %s | zone=%s | énergie=%s | cells découvertes=%s",
            direction,
            self._current_zone,
            data["energy"],
            len(move.discovered_cells),
        )

        if _is_island(data["position"]):
            logger.info("🏝️  Île atteinte : %s", data["position"])
            self.memory.mark_island(data["position"])
            if self._returning:
                self._on_return_complete()
                return

        if not self._returning:
            await self._check_fuel(data["energy"], data["position"])

    async def _check_fuel(self, energy: int, pos: dict) -> None:
        if self.world:
            await self.world.refresh()
            nearest = self.world.nearest_islands(pos["x"], pos["y"], self._current_zone, n=1)
            if nearest:
                target = nearest[0]
                distance = self.memory.distance_to(pos, target, self._current_zone)
                logger.debug(
                    "Vérification carburant | énergie=%s | distance île la plus proche=%s | île=(%s,%s)",
                    energy, distance, target["x"], target["y"],
                )
                if energy <= distance:
                    logger.info(
                        "⛽ Carburant critique (énergie=%s, distance=%s) — demi-tour vers île la plus proche (%s,%s)",
                        energy, distance, target["x"], target["y"],
                    )
                    self._returning = True
                    self._return_queue = self.memory.path_to(pos, target, self._current_zone)
                    self.memory.mark_island(target)
                    logger.info("🔄 Itinéraire retour calculé (%s étapes)", len(self._return_queue))
                return

        # Fallback sans DB : dernière île visitée en mémoire
        distance = self.memory.distance_to_island(pos, self._current_zone)
        island = self.memory.last_known_island_position()
        logger.debug(
            "Vérification carburant | énergie=%s | distance île=%s | île cible=(%s,%s)",
            energy, distance, island["x"], island["y"],
        )
        if energy <= distance:
            logger.info(
                "⛽ Carburant critique (énergie=%s, distance île=%s cases) — demi-tour vers (%s,%s)",
                energy, distance, island["x"], island["y"],
            )
            self._returning = True
            self._return_queue = self.memory.return_path_to_island(pos, self._current_zone)
            logger.info("🔄 Itinéraire retour calculé (%s étapes)", len(self._return_queue))

    def _pick_direction(self) -> str | None:
        if self._returning:
            return self._return_queue.pop(0) if self._return_queue else None
        return self.strategy.next_direction(self._current_zone, self.memory)

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


def _is_island(cell: dict) -> bool:
    return cell.get("type") in ISLAND_CELL_TYPES
