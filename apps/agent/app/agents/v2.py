"""Agent V2 — exploration en spirale avec rechargement proactif et navigation inter-zones.

Améliorations par rapport à V1 :
- Exploration en spirale d'Archimède depuis la dernière île visitée.
- Recharge proactive : retour automatique quand le carburant < 55% du max.
- Rechargement opportuniste : détour vers une île proche du trajet si le carburant est juste.
- Priorisation des zones supérieures : navigation vers la zone la plus haute connue.
- Upgrade automatique du bateau quand une bordure de zone bloque le passage.
- Validation des découvertes : retour vers l'île connue la plus proche après une découverte,
  puis nouveau vecteur de recherche depuis ce point sûr.
"""
import asyncio
import logging
import math
import random

from app.agents.base import BaseAgent, is_island
from app.config import settings
from app.db import MongoClient
from app.memory import ExplorationMemory, Move, HOME_POSITION, _distance, _path_to
from app.ws_client import SocketIOClient

logger = logging.getLogger(__name__)

# Directions disponibles par zone.
_ZONE1_DIRS: list[str] = ["N", "S", "E", "W"]
_ALL_DIRS: list[str] = ["N", "S", "E", "W", "NE", "NW", "SE", "SW"]

_DIR_VECTORS: dict[str, tuple[float, float]] = {
    "N":  ( 0.0,  1.0),
    "S":  ( 0.0, -1.0),
    "E":  ( 1.0,  0.0),
    "W":  (-1.0,  0.0),
    "NE": ( 1.0,  1.0),
    "NW": (-1.0,  1.0),
    "SE": ( 1.0, -1.0),
    "SW": (-1.0, -1.0),
}

# Détour max (en cases) accepté pour un rechargement opportuniste.
MAX_DETOUR_COST: int = 3


def _available_dirs(_zone: int) -> list[str]:
    return _ALL_DIRS if settings.enable_diagonal else _ZONE1_DIRS


def _normalize(v: tuple[float, float]) -> tuple[float, float]:
    mag = math.sqrt(v[0] ** 2 + v[1] ** 2)
    return (v[0] / mag, v[1] / mag) if mag > 0 else (0.0, 0.0)


def _dot(a: tuple[float, float], b: tuple[float, float]) -> float:
    return a[0] * b[0] + a[1] * b[1]


def _best_direction_toward(vx: float, vy: float, zone: int) -> str:
    """Retourne la direction disponible la plus alignée avec le vecteur (vx, vy)."""
    target = _normalize((vx, vy))
    dirs = _available_dirs(zone)
    return max(dirs, key=lambda d: _dot(_normalize(_DIR_VECTORS[d]), target))


class AgentV2(BaseAgent):
    def __init__(
        self,
        ws: SocketIOClient,
        db: MongoClient | None = None,
    ) -> None:
        super().__init__(ws, db=db)
        self.memory = ExplorationMemory(maxlen=200)
        self._current_zone: int = 1
        self._current_pos: dict | None = None
        self._current_energy: int = 0
        self._max_energy: int = 0
        # File de waypoints : chaque entrée = {"x": ..., "y": ..., "zone": ..., "reason": ...}
        self._waypoints: list[dict] = []
        # Chemin glouton vers le premier waypoint (directions à suivre).
        self._path_queue: list[str] = []
        # Spiral exploration state — angle ne se reset jamais à 0, il avance toujours.
        self._spiral_center: tuple[int, int] = (HOME_POSITION["x"], HOME_POSITION["y"])
        self._spiral_angle: float = 2.0 * math.pi  # démarrer à 1 tour pour r > 0
        # Anti-oscillation : 4 dernières directions d'exploration
        self._recent_dirs: list[str] = []

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def loop(self) -> None:
        # Restaurer la position depuis la DB.
        if self.world:
            ship = await self.world.get_ship_state(settings.coding_game_id)
            if ship:
                self._current_pos = ship["position"]
                self._current_energy = ship.get("energy", 0)
                self._current_zone = self._current_pos["zone"]
                if self._current_energy > self._max_energy:
                    self._max_energy = self._current_energy
                logger.info("📍 Position restaurée depuis DB : %s", self._current_pos)
                if is_island(self._current_pos):
                    self.memory.mark_island(self._current_pos)
                self._spiral_center = (self._current_pos["x"], self._current_pos["y"])

        self.memory.mark_island()
        logger.info("🏝️  Position initiale marquée comme île connue")

        while True:
            # Recalcul des priorités à chaque tick.
            if self.world:
                await self.world.refresh()

            direction = self._pick_direction()

            logger.debug(
                "🧭 Direction=%s | waypoints=%s | path_queue=%s | énergie=%s",
                direction,
                len(self._waypoints),
                len(self._path_queue),
                self._current_energy,
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
                elif "zone" in error.lower() and "accéder" in error.lower():
                    handled = await self._handle_zone_boundary()
                    if handled:
                        continue

                # Erreur inconnue → repli vers la dernière île connue
                self._retreat_to_nearest_island()
                await asyncio.sleep(2.3)
                continue

            await self._process_move(direction, resp["data"])
            await asyncio.sleep(2.3)

    # ------------------------------------------------------------------
    # Direction picking — priorités recalculées à chaque tick
    # ------------------------------------------------------------------

    def _pick_direction(self) -> str:
        # Recalcul des objectifs.
        self._resolve_goal()

        # Si on a un chemin calculé vers un waypoint, le suivre.
        if self._path_queue:
            return self._path_queue.pop(0)

        # Sinon, exploration anti-centroïde.
        return self._compute_exploration_direction()

    def _resolve_goal(self) -> None:
        """Recalcule les priorités et met à jour les waypoints."""
        if not self.world or self._current_pos is None:
            return

        pos = self._current_pos
        energy = self._current_energy
        zone = self._current_zone

        # --- 1. Énergie critique → île connue la plus proche ---
        nearest = self.world.nearest_islands(pos["x"], pos["y"], zone, n=1)
        dist_nearest = _distance(pos["x"], pos["y"], nearest[0]["x"], nearest[0]["y"], zone) if nearest else 0
        if nearest and energy <= dist_nearest + settings.energy_buffer:
            self._set_waypoint(nearest[0], "fuel_emergency")
            logger.info(
                "⛽ Énergie critique (%s) — retour vers île (%s,%s) dist=%s",
                energy, nearest[0]["x"], nearest[0]["y"], dist_nearest,
            )
            return

        # --- 1b. Recharge proactive si carburant < low_fuel_ratio ---
        # Skip si déjà sur une île (dist=0) pour éviter une boucle infinie.
        if self._max_energy > 0 and energy < settings.low_fuel_ratio * self._max_energy:
            if nearest and dist_nearest > 0:
                self._set_waypoint(nearest[0], "fuel_proactive")
                logger.info(
                    "⛽ Recharge proactive (energy=%s < %.0f%% of %s) — île (%s,%s) dist=%s",
                    energy, settings.low_fuel_ratio * 100, self._max_energy,
                    nearest[0]["x"], nearest[0]["y"], dist_nearest,
                )
                return

        # --- 2. Waypoint courant vers zone supérieure → le garder ---
        if self._waypoints and self._waypoints[0].get("reason") == "higher_zone":
            wp = self._waypoints[0]
            dist_wp = _distance(pos["x"], pos["y"], wp["x"], wp["y"], zone)
            if energy > dist_wp + settings.energy_buffer:
                # On peut encore y aller, garder le cap.
                return
            # Plus assez d'énergie → chercher un refuel en route.

        # --- 3. Île de zone supérieure connue → priorité ---
        max_zone = self.world.max_known_zone()
        if max_zone > zone:
            higher_islands = self.world.islands_in_zone(max_zone)
            if higher_islands:
                # Choisir l'île de zone supérieure la plus proche.
                target = min(
                    higher_islands,
                    key=lambda i: _distance(pos["x"], pos["y"], i["x"], i["y"], zone),
                )
                dist_target = _distance(pos["x"], pos["y"], target["x"], target["y"], zone)
                if energy > dist_target + settings.energy_buffer:
                    self._set_waypoint(target, "higher_zone")
                    logger.info(
                        "🗺️  Cible zone %s : (%s,%s) dist=%s",
                        max_zone, target["x"], target["y"], dist_target,
                    )
                    return
                # Pas assez d'énergie pour y aller directement → recharge intermédiaire.
                refuel = self._find_refuel_on_path(pos, target, energy, zone)
                if refuel:
                    self._set_waypoints([refuel, target], "higher_zone_via_refuel")
                    return

        # --- 4. Recharge opportuniste si un waypoint existe ---
        if self._waypoints:
            wp = self._waypoints[0]
            dist_wp = _distance(pos["x"], pos["y"], wp["x"], wp["y"], zone)
            if energy <= dist_wp + settings.energy_buffer:
                refuel = self._find_refuel_on_path(pos, wp, energy, zone)
                if refuel:
                    self._waypoints.insert(0, {**refuel, "reason": "refuel_opportunistic"})
                    self._path_queue = _path_to(
                        pos["x"], pos["y"], refuel["x"], refuel["y"], zone,
                    )
                    logger.info(
                        "⛽ Recharge opportuniste vers (%s,%s) avant waypoint (%s,%s)",
                        refuel["x"], refuel["y"], wp["x"], wp["y"],
                    )
                    return

        # --- 5. Aucun objectif prioritaire → vider les waypoints, mode exploration ---
        self._waypoints.clear()
        self._path_queue.clear()

    # ------------------------------------------------------------------
    # Waypoint management
    # ------------------------------------------------------------------

    def _set_waypoint(self, target: dict, reason: str) -> None:
        """Remplace tous les waypoints par un seul objectif."""
        self._waypoints = [{"x": target["x"], "y": target["y"], "zone": target.get("zone", self._current_zone), "reason": reason}]
        self._path_queue = _path_to(
            self._current_pos["x"], self._current_pos["y"],
            target["x"], target["y"],
            self._current_zone,
        )

    def _set_waypoints(self, targets: list[dict], reason: str) -> None:
        """Définit une file de waypoints, path vers le premier."""
        self._waypoints = [
            {"x": t["x"], "y": t["y"], "zone": t.get("zone", self._current_zone), "reason": reason}
            for t in targets
        ]
        first = self._waypoints[0]
        self._path_queue = _path_to(
            self._current_pos["x"], self._current_pos["y"],
            first["x"], first["y"],
            self._current_zone,
        )

    # ------------------------------------------------------------------
    # Exploration spirale
    # ------------------------------------------------------------------

    _OPPOSITE: dict[str, str] = {"N": "S", "S": "N", "E": "W", "W": "E",
                                   "NE": "SW", "SW": "NE", "NW": "SE", "SE": "NW"}
    _MIN_TARGET_DIST: float = 3.0

    def _compute_exploration_direction(self) -> str:
        """Spirale d'Archimède depuis la dernière île visitée.

        L'angle ne se reset jamais → chaque cycle de refuel explore une zone différente.
        On avance l'angle jusqu'à ce que la cible soit à >= MIN_TARGET_DIST pour éviter
        les aller-retours quand le point spiral est trop proche.
        """
        if self._current_pos is None:
            return random.choice(_ZONE1_DIRS)

        zone = self._current_zone
        cx, cy = self._spiral_center
        px, py = self._current_pos["x"], self._current_pos["y"]

        # Avancer la spirale jusqu'à ce que la cible soit assez loin
        vx, vy = 0.0, 0.0
        for _ in range(32):
            self._spiral_angle += settings.spiral_angle_step
            r = settings.spiral_growth * self._spiral_angle / (2.0 * math.pi)
            target_x = cx + r * math.cos(self._spiral_angle)
            target_y = cy + r * math.sin(self._spiral_angle)
            vx = target_x - px
            vy = target_y - py
            if math.sqrt(vx * vx + vy * vy) >= self._MIN_TARGET_DIST:
                break

        if abs(vx) < 0.01 and abs(vy) < 0.01:
            return random.choice(_available_dirs(zone))

        direction = _best_direction_toward(vx, vy, zone)

        # Anti-oscillation : si la direction est l'opposée de la précédente, avancer encore
        if self._recent_dirs and direction == self._OPPOSITE.get(self._recent_dirs[-1]):
            self._spiral_angle += settings.spiral_angle_step * 4
            r = settings.spiral_growth * self._spiral_angle / (2.0 * math.pi)
            target_x = cx + r * math.cos(self._spiral_angle)
            target_y = cy + r * math.sin(self._spiral_angle)
            vx = target_x - px
            vy = target_y - py
            if abs(vx) >= 0.01 or abs(vy) >= 0.01:
                direction = _best_direction_toward(vx, vy, zone)

        self._recent_dirs.append(direction)
        if len(self._recent_dirs) > 4:
            self._recent_dirs.pop(0)

        logger.info(
            "🌀 Spirale : center=(%s,%s) angle=%.0f° r=%.1f → target=(%.1f,%.1f) → %s",
            cx, cy, math.degrees(self._spiral_angle) % 360, r,
            target_x, target_y, direction,
        )
        return direction

    # ------------------------------------------------------------------
    # Rechargement opportuniste
    # ------------------------------------------------------------------

    def _find_refuel_on_path(
        self, pos: dict, dest: dict, energy: int, zone: int,
    ) -> dict | None:
        """Trouve une île connue proche du trajet pos→dest utilisable comme recharge."""
        if not self.world:
            return None

        islands = self.world.nearest_islands(pos["x"], pos["y"], zone, n=20)
        direct_dist = _distance(pos["x"], pos["y"], dest["x"], dest["y"], zone)
        best = None
        best_detour = MAX_DETOUR_COST + 1

        for island in islands:
            dist_to_island = _distance(pos["x"], pos["y"], island["x"], island["y"], zone)
            dist_island_to_dest = _distance(island["x"], island["y"], dest["x"], dest["y"], zone)

            # Coût du détour.
            detour = dist_to_island + dist_island_to_dest - direct_dist
            if detour > MAX_DETOUR_COST:
                continue
            # Atteignable avec le carburant actuel ?
            if dist_to_island >= energy:
                continue
            if detour < best_detour:
                best = island
                best_detour = detour

        if best:
            logger.info(
                "⛽ Île de recharge trouvée sur le trajet : (%s,%s) détour=%s cases",
                best["x"], best["y"], best_detour,
            )
        return best

    # ------------------------------------------------------------------
    # Move processing
    # ------------------------------------------------------------------

    async def _process_move(self, direction: str, data: dict) -> None:
        move = Move(
            direction=direction,
            position=data["position"],
            energy=data["energy"],
            discovered_cells=data.get("discoveredCells", []),
        )
        self.memory.record(move)
        self._current_pos = data["position"]
        self._current_energy = data["energy"]
        self._current_zone = data["position"]["zone"]

        logger.info(
            "⛵ %s | zone=%s | énergie=%s | cells découvertes=%s",
            direction,
            self._current_zone,
            data["energy"],
            len(move.discovered_cells),
        )

        if is_island(data["position"]):
            self._handle_island_arrival(data)

    def _handle_island_arrival(self, data: dict) -> None:
        """Traite l'arrivée sur une île : distinction nouvelle/connue, recharge, spiral reset.

        Si l'île est **nouvelle** (pas encore en DB), le bot programme un retour vers
        l'île connue la plus proche pour valider la découverte avant de repartir explorer.
        Le centre de spirale n'est repositionné qu'à l'arrivée sur une île connue/validée.
        """
        pos = data["position"]
        ix, iy = pos["x"], pos["y"]

        # Tracker l'énergie max (plein après atterrissage sur île)
        if data["energy"] > self._max_energy:
            self._max_energy = data["energy"]
            logger.info("⛽ Max energy mis à jour : %s", self._max_energy)

        self.memory.mark_island(pos)

        cell = self.world.cell_at(ix, iy) if self.world else None
        known = cell is not None and is_island(cell)
        if known:
            self._on_known_island(ix, iy)
        else:
            self._on_new_island(ix, iy)

    def _on_known_island(self, ix: int, iy: int) -> None:
        """Île connue : recharge, reset spiral, et consomme le waypoint courant."""
        logger.info("🏝️  Île connue atteinte : (%s,%s) — recharge", ix, iy)
        self._spiral_center = (ix, iy)
        self._complete_waypoint_if_reached(ix, iy)

    def _on_new_island(self, ix: int, iy: int) -> None:
        """Nouvelle île : programme un retour vers l'île connue la plus proche pour valider."""
        logger.info("🆕 Nouvelle île découverte : (%s,%s) — retour vers île connue pour valider", ix, iy)

        nearest = self.world.nearest_islands(ix, iy, self._current_zone, n=1) if self.world else []
        if nearest:
            self._set_waypoint(nearest[0], "validate_discovery")
            logger.info(
                "🔙 Validation : retour vers île connue (%s,%s) dist=%s",
                nearest[0]["x"], nearest[0]["y"],
                _distance(ix, iy, nearest[0]["x"], nearest[0]["y"], self._current_zone),
            )
        else:
            last = self.memory.last_known_island_position()
            self._set_waypoint(last, "validate_discovery_fallback")
            logger.info("🔙 Validation fallback : retour vers (%s,%s)", last["x"], last["y"])

    def _complete_waypoint_if_reached(self, ix: int, iy: int) -> None:
        """Consomme le premier waypoint s'il correspond à la position actuelle."""
        if not self._waypoints:
            return
        wp = self._waypoints[0]
        if wp["x"] != ix or wp["y"] != iy:
            return
        logger.info("✅ Waypoint atteint : (%s,%s) reason=%s", ix, iy, wp.get("reason"))
        self._waypoints.pop(0)
        self._path_queue.clear()
        if self._waypoints:
            nxt = self._waypoints[0]
            self._path_queue = _path_to(ix, iy, nxt["x"], nxt["y"], self._current_zone)

    # ------------------------------------------------------------------
    # Repli vers île connue
    # ------------------------------------------------------------------

    def _retreat_to_nearest_island(self) -> None:
        """En cas d'erreur bloquante, retour vers l'île connue la plus proche."""
        if not self.world or not self._current_pos:
            return
        nearest = self.world.nearest_islands(
            self._current_pos["x"], self._current_pos["y"], self._current_zone, n=1,
        )
        if nearest:
            self._set_waypoint(nearest[0], "error_retreat")
            logger.info(
                "🔙 Repli vers île (%s,%s) suite à erreur",
                nearest[0]["x"], nearest[0]["y"],
            )
        else:
            # Fallback: retour à la dernière île en mémoire
            last = self.memory.last_known_island_position()
            self._set_waypoint(last, "error_retreat_fallback")
            logger.info("🔙 Repli vers dernière île connue (%s,%s)", last["x"], last["y"])

    # ------------------------------------------------------------------
    # Zone boundary handling
    # ------------------------------------------------------------------

    async def _handle_zone_boundary(self) -> bool:
        """Tente un upgrade du bateau. Si échec, retour à l'île la plus proche."""
        logger.info("🚧 Bordure de zone — tentative d'upgrade")
        resp = await self._send("ship:upgrade")
        if resp.get("status") == "ok":
            logger.info("⬆️  Upgrade réussi — retry du move")
            return True

        logger.warning("⬆️  Upgrade échoué : %s — repli vers île la plus proche", resp.get("error"))
        # Retour à l'île connue la plus proche.
        if self.world and self._current_pos:
            nearest = self.world.nearest_islands(
                self._current_pos["x"], self._current_pos["y"], self._current_zone, n=1,
            )
            if nearest:
                self._set_waypoint(nearest[0], "zone_boundary_retreat")
                return True

        return False
