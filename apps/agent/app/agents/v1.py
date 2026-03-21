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

from app.agents.base import BaseAgent, is_island
from app.config import settings
from app.db import MongoClient
from app.memory import ExplorationMemory, Move
from app.strategy import ExplorationV1Strategy, Strategy
from app.ws_client import SocketIOClient

logger = logging.getLogger(__name__)


class AgentV1(BaseAgent):
    def __init__(
        self,
        ws: SocketIOClient,
        strategy: Strategy | None = None,
        db: MongoClient | None = None,
    ) -> None:
        super().__init__(ws, db=db)
        self.memory = ExplorationMemory(maxlen=200)
        self.strategy = strategy or ExplorationV1Strategy()
        self._returning = False
        self._return_queue: list[str] = []
        self._current_zone: int = 1

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def loop(self) -> None:
        # Restore ship position from DB if available.
        if self.world:
            ship = await self.world.get_ship_state(settings.coding_game_id)
            if ship:
                pos = ship["position"]
                logger.info("📍 Position restaurée depuis DB : %s", pos)
                self._current_zone = pos["zone"]
                if is_island(pos):
                    self.memory.mark_island(pos)

        # Marquer HOME comme fallback si pas de position restaurée.
        if not self.world or not await self.world.get_ship_state(settings.coding_game_id):
            from app.memory import HOME_POSITION
            self.memory.mark_island(HOME_POSITION)
            logger.info("🏝️  HOME marquée comme île connue (fallback)")

        while True:
            direction = self._pick_direction()
            if direction is None:
                self._on_return_complete(
                    self.memory.moves[-1].position if self.memory.moves else None
                )
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
                            continue
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
    # V1 helpers
    # ------------------------------------------------------------------

    def _on_return_complete(self, current_pos: dict | None = None) -> None:
        # Vérifier qu'on est bien sur une île avant de reprendre l'exploration
        if current_pos and not is_island(current_pos):
            logger.warning("⚠️  Retour terminé mais pas sur une île — recalcul du retour")
            self._return_queue = []
            self._returning = False
            return
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

        if is_island(data["position"]):
            logger.info("🏝️  Île atteinte : %s", data["position"])
            self.memory.mark_island(data["position"])
            if self._returning:
                self._on_return_complete(data["position"])
                return

        if not self._returning:
            await self._check_fuel(data["energy"], data["position"])

    async def _check_fuel(self, energy: int, pos: dict) -> None:
        buffer = settings.energy_buffer

        if self.world:
            await self.world.refresh()
            nearest = self.world.nearest_islands(
                pos["x"], pos["y"], self._current_zone, n=1, same_zone=True,
            )
            if nearest:
                target = nearest[0]
                distance = self.memory.distance_to(pos, target, self._current_zone)
                logger.debug(
                    "Vérification carburant | énergie=%s | distance île la plus proche=%s (+buffer %s) | île=(%s,%s)",
                    energy, distance, buffer, target["x"], target["y"],
                )
                if energy <= distance + buffer:
                    logger.info(
                        "⛽ Carburant critique (énergie=%s, distance=%s+%s) — demi-tour vers île (%s,%s)",
                        energy, distance, buffer, target["x"], target["y"],
                    )
                    self._returning = True
                    self._return_queue = self.memory.path_to(pos, target, self._current_zone)
                    logger.info("🔄 Itinéraire retour calculé (%s étapes)", len(self._return_queue))
                return

        # Fallback sans DB : dernière île visitée en mémoire
        distance = self.memory.distance_to_island(pos, self._current_zone)
        island = self.memory.last_known_island_position()
        logger.debug(
            "Vérification carburant | énergie=%s | distance île=%s (+buffer %s) | île cible=(%s,%s)",
            energy, distance, buffer, island["x"], island["y"],
        )
        if energy <= distance + buffer:
            logger.info(
                "⛽ Carburant critique (énergie=%s, distance île=%s+%s cases) — demi-tour vers (%s,%s)",
                energy, distance, buffer, island["x"], island["y"],
            )
            self._returning = True
            self._return_queue = self.memory.return_path_to_island(pos, self._current_zone)
            logger.info("🔄 Itinéraire retour calculé (%s étapes)", len(self._return_queue))

    def _pick_direction(self) -> str | None:
        if self._returning:
            return self._return_queue.pop(0) if self._return_queue else None
        return self.strategy.next_direction(self._current_zone, self.memory)
