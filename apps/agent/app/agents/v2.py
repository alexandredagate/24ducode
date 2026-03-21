"""Agent V2 — exploration autonome intelligente avec gestion économique.

Fonctionnalités :
- Exploration en spirale d'Archimède depuis la dernière île validée.
- Sécurité fuel : retour AVANT la panne, avec buffer configurable.
- Toujours cibler des îles dans la même zone (évite les murs de zone).
- Validation des découvertes : retour obligatoire sur île connue après SAND inconnue.
- Upgrade automatique ship + storage dès que les ressources le permettent.
- Marketplace : vente du surplus de ressource primaire, achat des 2 manquantes.
- Détection de panne sèche (energy=0) → attente + paiement amende.
- Vitesse de déplacement adaptée au level du ship.
- Status dashboard périodique dans les logs.
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

MAX_DETOUR_COST: int = 3
WAYPOINT_REACHED_THRESHOLD: int = 1
# Fréquence des actions économiques (toutes les N arrivées sur île)
ECONOMY_TICK_INTERVAL: int = 3
# Seuil minimum de gold pour ne pas tout dépenser en achats
MIN_GOLD_RESERVE: int = 500
# Quantité min de ressource primaire à garder avant de vendre
MIN_PRIMARY_RESERVE: int = 1000


def _available_dirs(zone: int) -> list[str]:
    return _ALL_DIRS if settings.enable_diagonal else _ZONE1_DIRS


def _normalize(v: tuple[float, float]) -> tuple[float, float]:
    mag = math.sqrt(v[0] ** 2 + v[1] ** 2)
    return (v[0] / mag, v[1] / mag) if mag > 0 else (0.0, 0.0)


def _dot(a: tuple[float, float], b: tuple[float, float]) -> float:
    return a[0] * b[0] + a[1] * b[1]


def _best_direction_toward(vx: float, vy: float, zone: int) -> str:
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
        self._ship_speed_ms: float = 2000.0
        self._ship_level: int = 1
        self._stranded: bool = False
        # Waypoints
        self._waypoints: list[dict] = []
        self._path_queue: list[str] = []
        # Spiral state
        self._spiral_center: tuple[int, int] = (HOME_POSITION["x"], HOME_POSITION["y"])
        self._spiral_angle: float = 2.0 * math.pi
        self._recent_dirs: list[str] = []
        # Error tracking
        self._consecutive_errors: int = 0
        self._MAX_CONSECUTIVE_ERRORS: int = 5
        # Stats
        self._total_moves: int = 0
        self._islands_discovered: int = 0
        self._island_arrival_count: int = 0
        # Economy
        self._marketplace_discovered: bool = False
        self._primary_resource: str | None = None  # BOISIUM, FERONIUM, ou CHARBONIUM

    # ══════════════════════════════════════════════════════════════════════
    # MAIN LOOP
    # ══════════════════════════════════════════════════════════════════════

    async def loop(self) -> None:
        await self._init_ship_state()
        self._log_banner()

        while True:
            if self.world:
                await self.world.refresh()

            if self._stranded:
                await self._handle_stranded()
                continue

            self._check_failed_return()

            direction = self._pick_direction()

            resp = await self._send("ship:move", {"direction": direction})
            if resp.get("status") != "ok":
                await self._handle_move_error(resp.get("error", ""))
                continue

            self._consecutive_errors = 0
            self._total_moves += 1
            await self._process_move(direction, resp["data"])

            # Status périodique
            if self._total_moves % 20 == 0:
                self._log_status()

            await asyncio.sleep(self._move_delay())

    # ══════════════════════════════════════════════════════════════════════
    # INITIALISATION
    # ══════════════════════════════════════════════════════════════════════

    async def _init_ship_state(self) -> None:
        if self._player_details:
            ship = self._player_details.get("ship", {})
            level = ship.get("level", {})
            self._ship_speed_ms = level.get("speed", 2000)
            self._ship_level = level.get("id", 1)
            self._max_energy = ship.get("availableMove", 0)
            self._marketplace_discovered = self._player_details.get("marketPlaceDiscovered", False)

            # Déterminer la ressource primaire (celle qu'on produit)
            resources = self._player_details.get("resources", [])
            if resources:
                self._primary_resource = max(resources, key=lambda r: r.get("quantity", 0)).get("type")

            logger.info(
                "╔══════════════════════════════════════╗\n"
                "║        INITIALISATION AGENT V2       ║\n"
                "╠══════════════════════════════════════╣\n"
                "║  Ship level    : %-19s ║\n"
                "║  Speed         : %-15sms  ║\n"
                "║  Max energy    : %-19s ║\n"
                "║  Resource      : %-19s ║\n"
                "║  Marketplace   : %-19s ║\n"
                "║  Money         : %-19s ║\n"
                "║  Quotient      : %-19s ║\n"
                "╚══════════════════════════════════════╝",
                self._ship_level, self._ship_speed_ms, self._max_energy,
                self._primary_resource or "?",
                "UNLOCKED" if self._marketplace_discovered else "LOCKED",
                self._player_details.get("money", "?"),
                self._player_details.get("quotient", "?"),
            )

        # Restaurer position depuis DB
        if self.world:
            ship_state = await self.world.get_ship_state(settings.coding_game_id)
            if ship_state:
                self._current_pos = ship_state["position"]
                self._current_energy = ship_state.get("energy", 0)
                self._current_zone = self._current_pos["zone"]
                if self._current_energy > self._max_energy:
                    self._max_energy = self._current_energy
                logger.info(
                    "📍 Position restaurée : (%s,%s) zone=%s energy=%s/%s",
                    self._current_pos["x"], self._current_pos["y"],
                    self._current_zone, self._current_energy, self._max_energy,
                )
                if is_island(self._current_pos):
                    self.memory.mark_island(self._current_pos)
                    self._spiral_center = (self._current_pos["x"], self._current_pos["y"])

        if not self._current_pos:
            self.memory.mark_island(HOME_POSITION)
            logger.info("🏝️  HOME (%s,%s) marquée comme fallback", HOME_POSITION["x"], HOME_POSITION["y"])

    def _move_delay(self) -> float:
        return max(self._ship_speed_ms / 1000.0, 1.0) + 0.3

    def _log_banner(self) -> None:
        logger.info(
            "\n"
            "  ⚓ ════════════════════════════════ ⚓\n"
            "  ║     AGENT V2 — EN ROUTE !         ║\n"
            "  ⚓ ════════════════════════════════ ⚓\n"
        )

    def _log_status(self) -> None:
        wp_info = "aucun"
        if self._waypoints:
            wp = self._waypoints[0]
            wp_info = f"({wp['x']},{wp['y']}) [{wp.get('reason', '?')}]"
        logger.info(
            "\n┌─── STATUS ─── move #%s ───────────────┐\n"
            "│  Position   : (%s,%s) zone=%s        \n"
            "│  Energy     : %s / %s                 \n"
            "│  Ship level : %s                      \n"
            "│  Waypoint   : %s                      \n"
            "│  Path queue : %s steps                 \n"
            "│  Îles vues  : %s                      \n"
            "│  Spiral     : angle=%.0f° r=%.1f      \n"
            "└───────────────────────────────────────┘",
            self._total_moves,
            self._current_pos["x"] if self._current_pos else "?",
            self._current_pos["y"] if self._current_pos else "?",
            self._current_zone,
            self._current_energy, self._max_energy,
            self._ship_level,
            wp_info,
            len(self._path_queue),
            self._islands_discovered,
            math.degrees(self._spiral_angle) % 360,
            settings.spiral_growth * self._spiral_angle / (2.0 * math.pi),
        )

    # ══════════════════════════════════════════════════════════════════════
    # ERROR HANDLING
    # ══════════════════════════════════════════════════════════════════════

    async def _handle_move_error(self, error: str) -> None:
        self._consecutive_errors += 1
        logger.warning(
            "⚠️  ERREUR MOVE [%s/%s] : %s",
            self._consecutive_errors, self._MAX_CONSECUTIVE_ERRORS, error,
        )

        if "GAME_OVER_INSERT_COINS" in error or "amende" in error.lower():
            if settings.auto_pay_fines:
                paid = await self._handle_fine()
                if paid:
                    self._consecutive_errors = 0
                    return
            logger.info("💰 Amende détectée — attente 5s...")
            await asyncio.sleep(5.0)
            return

        if "zone" in error.lower() and "accéder" in error.lower():
            handled = await self._handle_zone_boundary()
            if handled:
                self._consecutive_errors = 0
                return

        if "mouvement" in error.lower() or "energy" in error.lower() or "move" in error.lower():
            logger.warning("🚨 PANNE SECHE — energy=0 en pleine mer")
            self._stranded = True
            return

        if self._consecutive_errors >= self._MAX_CONSECUTIVE_ERRORS:
            logger.error(
                "🔴 %s ERREURS CONSECUTIVES — reset total + repli forcé",
                self._consecutive_errors,
            )
            self._waypoints.clear()
            self._path_queue.clear()
            self._retreat_to_nearest_island()
            self._consecutive_errors = 0

        await asyncio.sleep(3.0)

    async def _handle_stranded(self) -> None:
        logger.info(
            "🚨 ═══ STRANDED ═══ Tentative de résolution... "
            "(auto_pay=%s)", settings.auto_pay_fines,
        )
        if settings.auto_pay_fines:
            await self._handle_fine()
        await asyncio.sleep(10.0)
        # Tenter un move pour voir si on est sorti
        direction = random.choice(_available_dirs(self._current_zone))
        resp = await self._send("ship:move", {"direction": direction})
        if resp.get("status") == "ok":
            logger.info("✅ SORTI DE PANNE SECHE — reprise de l'exploration!")
            self._stranded = False
            await self._process_move(direction, resp["data"])
        else:
            logger.info("⏳ Toujours stranded... nouvelle tentative dans 10s")

    def _check_failed_return(self) -> None:
        if (
            not self._path_queue
            and self._waypoints
            and self._waypoints[0].get("reason", "").startswith("fuel")
            and self._current_pos
            and not is_island(self._current_pos)
        ):
            logger.warning("⚠️  Retour fuel ECHOUE (pas sur île) — recalcul du chemin")
            self._waypoints.clear()
            self._retreat_to_nearest_island()

    # ══════════════════════════════════════════════════════════════════════
    # DIRECTION PICKING
    # ══════════════════════════════════════════════════════════════════════

    def _pick_direction(self) -> str:
        self._resolve_goal()
        if self._path_queue:
            return self._path_queue.pop(0)
        return self._compute_exploration_direction()

    def _resolve_goal(self) -> None:
        if not self.world or self._current_pos is None:
            return

        pos = self._current_pos
        energy = self._current_energy
        zone = self._current_zone
        buffer = settings.energy_buffer

        # --- 1. URGENCE FUEL ---
        nearest = self._find_nearest_known_island(pos, zone)
        if not nearest:
            nearest = HOME_POSITION
        dist_nearest = _distance(pos["x"], pos["y"], nearest["x"], nearest["y"], zone)

        if energy <= dist_nearest + buffer:
            if not self._waypoints or not self._waypoints[0].get("reason", "").startswith("fuel"):
                self._set_waypoint(nearest, "fuel_emergency")
                logger.info(
                    "⛽ ══ URGENCE FUEL ══ energy=%s <= dist(%s)+buffer(%s) → retour (%s,%s)",
                    energy, dist_nearest, buffer, nearest["x"], nearest["y"],
                )
            return

        # --- 1b. RECHARGE PROACTIVE ---
        if self._max_energy > 0 and energy < int(settings.low_fuel_ratio * self._max_energy):
            if dist_nearest > 0:
                self._set_waypoint(nearest, "fuel_proactive")
                logger.info(
                    "⛽ Recharge proactive energy=%s < %s%% max(%s) → (%s,%s) dist=%s",
                    energy, int(settings.low_fuel_ratio * 100), self._max_energy,
                    nearest["x"], nearest["y"], dist_nearest,
                )
                return

        # --- 2. VALIDATION EN COURS ---
        if self._waypoints and self._waypoints[0].get("reason", "").startswith("validate"):
            wp = self._waypoints[0]
            dist_wp = _distance(pos["x"], pos["y"], wp["x"], wp["y"], zone)
            if energy > dist_wp + buffer:
                return

        # --- 3. CAP ZONE SUPERIEURE EN COURS ---
        if self._waypoints and self._waypoints[0].get("reason") == "higher_zone":
            wp = self._waypoints[0]
            dist_wp = _distance(pos["x"], pos["y"], wp["x"], wp["y"], zone)
            if energy > dist_wp + buffer:
                return

        # --- 4. ZONE SUPERIEURE DISPONIBLE ---
        max_zone = self.world.max_known_zone()
        if max_zone > zone:
            higher_islands = self.world.islands_in_zone(max_zone)
            if higher_islands:
                target = min(
                    higher_islands,
                    key=lambda i: _distance(pos["x"], pos["y"], i["x"], i["y"], zone),
                )
                dist_target = _distance(pos["x"], pos["y"], target["x"], target["y"], zone)
                if energy > dist_target + buffer:
                    self._set_waypoint(target, "higher_zone")
                    logger.info(
                        "🗺️  CAP ZONE %s → (%s,%s) dist=%s",
                        max_zone, target["x"], target["y"], dist_target,
                    )
                    return
                refuel = self._find_refuel_on_path(pos, target, energy, zone)
                if refuel:
                    self._set_waypoints([refuel, target], "higher_zone_via_refuel")
                    return

        # --- 5. MODE EXPLORATION ---
        self._waypoints.clear()
        self._path_queue.clear()

    def _find_nearest_known_island(self, pos: dict, zone: int) -> dict | None:
        """Trouve l'île KNOWN (validée) la plus proche. Seules celles-ci rechargent le fuel."""
        if not self.world:
            return None
        nearest = self.world.nearest_known_islands(pos["x"], pos["y"], zone, n=1, same_zone=True)
        if nearest:
            return nearest[0]
        nearest = self.world.nearest_known_islands(pos["x"], pos["y"], zone, n=1)
        if nearest:
            return nearest[0]
        return None

    # ══════════════════════════════════════════════════════════════════════
    # WAYPOINT MANAGEMENT
    # ══════════════════════════════════════════════════════════════════════

    def _set_waypoint(self, target: dict, reason: str) -> None:
        self._waypoints = [{
            "x": target["x"], "y": target["y"],
            "zone": target.get("zone", self._current_zone),
            "reason": reason,
        }]
        self._path_queue = _path_to(
            self._current_pos["x"], self._current_pos["y"],
            target["x"], target["y"],
            self._current_zone,
        )

    def _set_waypoints(self, targets: list[dict], reason: str) -> None:
        self._waypoints = [{
            "x": t["x"], "y": t["y"],
            "zone": t.get("zone", self._current_zone),
            "reason": reason,
        } for t in targets]
        if self._waypoints:
            first = self._waypoints[0]
            self._path_queue = _path_to(
                self._current_pos["x"], self._current_pos["y"],
                first["x"], first["y"],
                self._current_zone,
            )

    # ══════════════════════════════════════════════════════════════════════
    # EXPLORATION SPIRALE
    # ══════════════════════════════════════════════════════════════════════

    _OPPOSITE: dict[str, str] = {
        "N": "S", "S": "N", "E": "W", "W": "E",
        "NE": "SW", "SW": "NE", "NW": "SE", "SE": "NW",
    }
    _MIN_TARGET_DIST: float = 3.0

    def _compute_exploration_direction(self) -> str:
        if self._current_pos is None:
            return random.choice(_ZONE1_DIRS)

        zone = self._current_zone
        cx, cy = self._spiral_center
        px, py = self._current_pos["x"], self._current_pos["y"]

        vx, vy = 0.0, 0.0
        target_x, target_y = float(px), float(py)
        r = 0.0
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

        # Anti-oscillation
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
            "🌀 SPIRAL center=(%s,%s) θ=%.0f° r=%.1f → target=(%.1f,%.1f) → %s",
            cx, cy, math.degrees(self._spiral_angle) % 360, r,
            target_x, target_y, direction,
        )
        return direction

    # ══════════════════════════════════════════════════════════════════════
    # RECHARGEMENT OPPORTUNISTE
    # ══════════════════════════════════════════════════════════════════════

    def _find_refuel_on_path(
        self, pos: dict, dest: dict, energy: int, zone: int,
    ) -> dict | None:
        if not self.world:
            return None
        islands = self.world.nearest_known_islands(pos["x"], pos["y"], zone, n=20, same_zone=True)
        direct_dist = _distance(pos["x"], pos["y"], dest["x"], dest["y"], zone)
        best = None
        best_detour = MAX_DETOUR_COST + 1

        for island in islands:
            dist_to = _distance(pos["x"], pos["y"], island["x"], island["y"], zone)
            dist_from = _distance(island["x"], island["y"], dest["x"], dest["y"], zone)
            detour = dist_to + dist_from - direct_dist
            if detour > MAX_DETOUR_COST:
                continue
            if dist_to >= energy - settings.energy_buffer:
                continue
            if detour < best_detour:
                best = island
                best_detour = detour

        if best:
            logger.info(
                "⛽ Recharge opportuniste trouvée : (%s,%s) détour=%s cases",
                best["x"], best["y"], best_detour,
            )
        return best

    # ══════════════════════════════════════════════════════════════════════
    # MOVE PROCESSING
    # ══════════════════════════════════════════════════════════════════════

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

        # Log avec barre d'énergie visuelle
        energy_bar = self._energy_bar(data["energy"])
        logger.info(
            "⛵ %s → (%s,%s) z%s | %s %s/%s | +%s cells",
            direction,
            self._current_pos["x"], self._current_pos["y"],
            self._current_zone,
            energy_bar, data["energy"], self._max_energy,
            len(move.discovered_cells),
        )

        # Panne sèche ?
        if data["energy"] <= 0 and not is_island(data["position"]):
            logger.warning("🚨 ══ PANNE SECHE ══ energy=0 en pleine mer!")
            self._stranded = True
            return

        if is_island(data["position"]):
            await self._handle_island_arrival(data)
        else:
            self._try_consume_waypoint(data["position"])

    def _energy_bar(self, energy: int) -> str:
        if self._max_energy <= 0:
            return "[??????????]"
        ratio = energy / self._max_energy
        filled = int(ratio * 10)
        return "[" + "█" * filled + "░" * (10 - filled) + "]"

    # ══════════════════════════════════════════════════════════════════════
    # ISLAND ARRIVAL
    # ══════════════════════════════════════════════════════════════════════

    async def _handle_island_arrival(self, data: dict) -> None:
        pos = data["position"]
        ix, iy = pos["x"], pos["y"]

        if data["energy"] > self._max_energy:
            self._max_energy = data["energy"]
            logger.info("⛽ Max energy mis à jour : %s", self._max_energy)

        self.memory.mark_island(pos)
        self._island_arrival_count += 1

        # KNOWN = validée (recharge fuel) vs DISCOVERED = vue mais pas validée
        known = self.world.is_known_island(ix, iy) if self.world else False

        if known:
            self._on_known_island(ix, iy)
        else:
            self._islands_discovered += 1
            self._on_new_island(ix, iy)

        # Actions économiques périodiques (sur île connue seulement)
        if known and self._island_arrival_count % ECONOMY_TICK_INTERVAL == 0:
            await self._economy_tick()

    def _on_known_island(self, ix: int, iy: int) -> None:
        logger.info("🏝️  ÎLE CONNUE (%s,%s) — recharge + spiral reset", ix, iy)
        self._spiral_center = (ix, iy)
        self._try_consume_waypoint({"x": ix, "y": iy})

    def _on_new_island(self, ix: int, iy: int) -> None:
        logger.info(
            "🆕 ══ NOUVELLE ÎLE #%s ══ (%s,%s) — retour pour validation!",
            self._islands_discovered, ix, iy,
        )

        nearest = None
        if self.world:
            nearest_list = self.world.nearest_known_islands(
                ix, iy, self._current_zone, n=1, same_zone=True,
            )
            if nearest_list:
                nearest = nearest_list[0]

        if not nearest:
            nearest = self.memory.last_known_island_position()

        self._set_waypoint(nearest, "validate_discovery")
        logger.info(
            "🔙 Validation → (%s,%s) dist=%s",
            nearest["x"], nearest["y"],
            _distance(ix, iy, nearest["x"], nearest["y"], self._current_zone),
        )

    def _try_consume_waypoint(self, pos: dict) -> None:
        if not self._waypoints:
            return
        wp = self._waypoints[0]
        dist = _distance(pos["x"], pos["y"], wp["x"], wp["y"], self._current_zone)
        if dist > WAYPOINT_REACHED_THRESHOLD:
            return

        logger.info(
            "✅ WAYPOINT ATTEINT (%s,%s) [%s] dist=%s",
            wp["x"], wp["y"], wp.get("reason", "?"), dist,
        )
        self._waypoints.pop(0)
        self._path_queue.clear()
        if self._waypoints:
            nxt = self._waypoints[0]
            self._path_queue = _path_to(
                pos["x"], pos["y"], nxt["x"], nxt["y"], self._current_zone,
            )

    # ══════════════════════════════════════════════════════════════════════
    # ECONOMY — upgrades + marketplace
    # ══════════════════════════════════════════════════════════════════════

    async def _economy_tick(self) -> None:
        """Actions économiques exécutées périodiquement sur île connue."""
        logger.info("💹 ═══ ECONOMY TICK ═══")

        details_resp = await self._send("player:details")
        if details_resp.get("status") != "ok":
            logger.warning("💹 Impossible de récupérer player:details")
            return
        details = details_resp["data"]

        money = details.get("money", 0)
        resources = {r["type"]: r["quantity"] for r in details.get("resources", [])}
        self._marketplace_discovered = details.get("marketPlaceDiscovered", False)

        # Mettre à jour la ressource primaire
        if resources:
            self._primary_resource = max(resources, key=resources.get)

        logger.info(
            "💰 Money=%s | Resources: %s | Marketplace: %s",
            money,
            " | ".join(f"{k}={v}" for k, v in resources.items()),
            "UNLOCKED" if self._marketplace_discovered else "LOCKED",
        )

        # 1. Upgrade storage (priorité haute — éviter de perdre des ressources)
        await self._try_upgrade_storage(resources)

        # 2. Upgrade ship (si on a les ressources)
        await self._try_upgrade_ship(resources)

        # 3. Marketplace (si débloqué)
        if self._marketplace_discovered:
            await self._try_marketplace(money, resources)

    async def _try_upgrade_storage(self, resources: dict) -> None:
        """Tente d'upgrader le storage si les ressources le permettent."""
        resp = await self._send("storage:next-level")
        if resp.get("status") != "ok" or not resp.get("data"):
            return

        data = resp["data"]
        cost = data.get("costResources", {})
        name = data.get("name", "?")

        if not cost:
            return

        can_afford = all(resources.get(res, 0) >= amount for res, amount in cost.items())
        if can_afford:
            upgrade_resp = await self._send("storage:upgrade")
            if upgrade_resp.get("status") == "ok":
                logger.info("📦 ══ STORAGE UPGRADE ══ → %s", name)
            else:
                logger.warning("📦 Storage upgrade échoué : %s", upgrade_resp.get("error"))
        else:
            missing = {res: max(0, amount - resources.get(res, 0)) for res, amount in cost.items() if resources.get(res, 0) < amount}
            logger.info("📦 Storage upgrade → %s (manque: %s)", name, missing)

    async def _try_upgrade_ship(self, resources: dict) -> None:
        """Tente d'upgrader le ship si les ressources le permettent."""
        resp = await self._send("ship:next-level")
        if resp.get("status") != "ok" or not resp.get("data"):
            return

        data = resp["data"]
        cost = data.get("costResources", {})
        next_level = data.get("level", {})
        next_level_id = next_level.get("id")

        if not next_level_id or next_level_id <= self._ship_level:
            return

        if not cost:
            return

        can_afford = all(resources.get(res, 0) >= amount for res, amount in cost.items())
        if can_afford:
            upgrade_resp = await self._send("ship:upgrade", {"level": next_level_id})
            if upgrade_resp.get("status") == "ok":
                self._ship_level = next_level_id
                self._ship_speed_ms = next_level.get("speed", self._ship_speed_ms)
                logger.info(
                    "🚢 ══ SHIP UPGRADE ══ level %s (%s) speed=%sms",
                    next_level_id, next_level.get("name", "?"), self._ship_speed_ms,
                )
            else:
                logger.warning("🚢 Ship upgrade échoué : %s", upgrade_resp.get("error"))
        else:
            missing = {res: max(0, amount - resources.get(res, 0)) for res, amount in cost.items() if resources.get(res, 0) < amount}
            logger.info("🚢 Ship upgrade level %s (manque: %s)", next_level_id, missing)

    async def _try_marketplace(self, money: int, resources: dict) -> None:
        """Vend le surplus de ressource primaire et achète les manquantes."""
        if not self._primary_resource:
            return

        primary_qty = resources.get(self._primary_resource, 0)
        all_resource_types = {"BOISIUM", "FERONIUM", "CHARBONIUM"}
        needed_types = all_resource_types - {self._primary_resource}

        # --- VENDRE le surplus de ressource primaire ---
        sellable = primary_qty - MIN_PRIMARY_RESERVE
        if sellable > 500:
            # Vérifier qu'on n'a pas déjà une offre active
            offers_resp = await self._send("marketplace:offers")
            if offers_resp.get("status") == "ok":
                my_offers = [
                    o for o in offers_resp.get("data", [])
                    if o.get("owner", {}).get("name") == self._player_details.get("name")
                ]
                if not my_offers:
                    sell_qty = min(sellable, 2000)
                    create_resp = await self._send("marketplace:create-offer", {
                        "resourceType": self._primary_resource,
                        "quantityIn": sell_qty,
                        "pricePerResource": 2,
                    })
                    if create_resp.get("status") == "ok":
                        logger.info(
                            "🏪 ══ VENTE ══ %s x%s à 2 gold/u",
                            self._primary_resource, sell_qty,
                        )
                    else:
                        logger.warning("🏪 Vente échouée : %s", create_resp.get("error"))
                else:
                    logger.info("🏪 Offre déjà active — pas de nouvelle vente")

        # --- ACHETER les ressources manquantes ---
        if money < MIN_GOLD_RESERVE:
            logger.info("🏪 Pas assez de gold (%s) pour acheter — seuil=%s", money, MIN_GOLD_RESERVE)
            return

        offers_resp = await self._send("marketplace:offers")
        if offers_resp.get("status") != "ok":
            return

        available_gold = money - MIN_GOLD_RESERVE

        for res_type in needed_types:
            current_qty = resources.get(res_type, 0)
            if current_qty > 1000:
                continue  # assez de cette ressource

            # Chercher la meilleure offre pour cette ressource
            offers = [
                o for o in offers_resp.get("data", [])
                if o.get("resourceType") == res_type
                and o.get("owner", {}).get("name") != self._player_details.get("name")
            ]
            if not offers:
                continue

            best_offer = min(offers, key=lambda o: o.get("pricePerResource", 999))
            price = best_offer.get("pricePerResource", 999)
            available_qty = best_offer.get("quantityIn", 0)

            if price > 5:
                logger.info("🏪 %s trop cher (%s gold/u) — skip", res_type, price)
                continue

            max_qty = min(available_qty, available_gold // price, 1000)
            if max_qty < 50:
                continue

            buy_resp = await self._send("marketplace:purchase", {
                "offerId": best_offer["id"],
                "quantity": max_qty,
            })
            if buy_resp.get("status") == "ok":
                available_gold -= max_qty * price
                logger.info(
                    "🏪 ══ ACHAT ══ %s x%s à %s gold/u (total: %s gold)",
                    res_type, max_qty, price, max_qty * price,
                )
            else:
                logger.warning("🏪 Achat échoué : %s", buy_resp.get("error"))

    # ══════════════════════════════════════════════════════════════════════
    # REPLI
    # ══════════════════════════════════════════════════════════════════════

    def _retreat_to_nearest_island(self) -> None:
        if not self._current_pos:
            return
        nearest = self._find_nearest_known_island(self._current_pos, self._current_zone)
        if nearest:
            self._set_waypoint(nearest, "error_retreat")
            logger.info("🔙 REPLI → (%s,%s)", nearest["x"], nearest["y"])
        else:
            last = self.memory.last_known_island_position()
            self._set_waypoint(last, "error_retreat_fallback")
            logger.info("🔙 REPLI FALLBACK → (%s,%s)", last["x"], last["y"])

    # ══════════════════════════════════════════════════════════════════════
    # ZONE BOUNDARY
    # ══════════════════════════════════════════════════════════════════════

    async def _handle_zone_boundary(self) -> bool:
        logger.info("🚧 ══ BORDURE DE ZONE ══ tentative d'upgrade")

        next_resp = await self._send("ship:next-level")
        if next_resp.get("status") == "ok" and next_resp.get("data"):
            data = next_resp["data"]
            next_level_id = data.get("level", {}).get("id")
            if next_level_id and next_level_id > self._ship_level:
                resp = await self._send("ship:upgrade", {"level": next_level_id})
                if resp.get("status") == "ok":
                    self._ship_level = next_level_id
                    details = await self._send("player:details")
                    if details.get("status") == "ok":
                        ship = details["data"].get("ship", {})
                        level = ship.get("level", {})
                        self._ship_speed_ms = level.get("speed", self._ship_speed_ms)
                    logger.info(
                        "⬆️  ══ UPGRADE REUSSI ══ level %s! speed=%sms",
                        next_level_id, self._ship_speed_ms,
                    )
                    return True
                logger.warning("⬆️  Upgrade échoué : %s", resp.get("error"))
            else:
                logger.warning("⬆️  Déjà au level max (%s)", self._ship_level)
        else:
            logger.warning("⬆️  ship:next-level échoué : %s", next_resp.get("error"))

        self._retreat_to_nearest_island()
        return True
