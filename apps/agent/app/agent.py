"""Agent V1 — exploration avec gestion du carburant.

Stratégie :
- Vecteur de direction aléatoire, renouvelé toutes les N cases.
- Zone 1 : directions cardinales uniquement (N/S/E/W).
- Sécurité carburant : si énergie ≤ steps_retour + buffer, on rebrousse chemin.
- Mémoire des 30 derniers mouvements pour savoir comment revenir à la dernière île.
"""
import asyncio
import logging

from app.config import settings
from app.memory import ExplorationMemory, Move
from app.strategy import ExplorationV1Strategy, Strategy
from app.ws_client import SocketIOClient

logger = logging.getLogger(__name__)

# Cell types considered as "island" — adjust if the game uses different values.
ISLAND_CELL_TYPES: frozenset[str] = frozenset({"SAND"})


class AgentV1:
    def __init__(self, ws: SocketIOClient, strategy: Strategy | None = None) -> None:
        self.ws = ws
        self.memory = ExplorationMemory(maxlen=30)
        self.strategy = strategy or ExplorationV1Strategy()
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
                wait = 6.0 if "rapide" in error.lower() or "5000" in error else 1.0
                await asyncio.sleep(wait)
                continue

            self._process_move(direction, resp["data"])

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

    def _process_move(self, direction: str, data: dict) -> None:
        move = Move(
            direction=direction,
            position=data["position"],
            energy=data["energy"],
            discovered_cells=data.get("discoveredCells", []),
        )
        self.memory.record(move)
        self._current_zone = data["position"]["zone"]

        logger.debug(
            "⛵ %s | zone=%s | énergie=%s | cells découvertes=%s",
            direction,
            self._current_zone,
            data["energy"],
            len(move.discovered_cells),
        )

        if _is_island(data["position"]):
            logger.info("🏝️  Île atteinte : %s", data["position"])
            self.memory.mark_island()

        if not self._returning:
            self._check_fuel(data["energy"])

    def _check_fuel(self, energy: int) -> None:
        steps_back = self.memory.steps_since_island()
        logger.debug(
            "Vérification carburant | énergie=%s | retour=%s | buffer=%s",
            energy,
            steps_back,
            settings.energy_buffer,
        )
        if energy <= steps_back + settings.energy_buffer:
            logger.info(
                "⛽ Carburant critique (énergie=%s, retour=%s cases) — demi-tour",
                energy,
                steps_back,
            )
            self._returning = True
            self._return_queue = self.memory.return_path()
            logger.info("🔄 Itinéraire retour calculé (%s étapes)",
                        len(self._return_queue))

    def _pick_direction(self) -> str | None:
        if self._returning:
            return self._return_queue.pop(0) if self._return_queue else None
        return self.strategy.next_direction(self._current_zone, self.memory)

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
