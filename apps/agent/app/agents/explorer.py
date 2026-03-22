"""ExplorerAgent — agent d'exploration autonome.

Algorithme SIMPLE et FIABLE :

À CHAQUE tick, dans cet ordre strict :

1. FUEL CHECK (jamais ignoré, jamais bypassé)
   - Trouver l'île la plus proche (N'IMPORTE QUELLE SAND, pas que KNOWN)
   - Si energy <= distance + buffer → STOP TOUT, retour immédiat
   - Si energy < 60% max → retour proactif
   - Si pas assez pour explorer + revenir → retour

2. OBJECTIFS (seulement si fuel OK)
   - Waypoint en cours (validation, zone sup) → continuer si affordable
   - Sinon → exploration en spirale

3. ARRIVÉE SUR ÎLE
   - SAND quelconque → recharge fuel
   - SAND KNOWN → valide les découvertes (côté API)
   - SAND nouvelle (pas en DB) → programmer retour vers KNOWN pour valider

FUEL = n'importe quelle île SAND (le jeu recharge sur toute île)
VALIDATION = seulement les îles KNOWN
"""
import asyncio
import logging
import math
import random

from app.agents.base import BaseAgent, is_island
from app.config import settings
from app.db import MongoClient
from app.memory import HOME_POSITION, _distance, _path_to, Move, ExplorationMemory
from app.ws_client import SocketIOClient

logger = logging.getLogger(__name__)

_ZONE1_DIRS = ["N", "S", "E", "W"]
_ALL_DIRS = ["N", "S", "E", "W", "NE", "NW", "SE", "SW"]
_DIR_VECTORS = {
    "N": (0.0, -1.0), "S": (0.0, 1.0), "E": (1.0, 0.0), "W": (-1.0, 0.0),
    "NE": (1.0, -1.0), "NW": (-1.0, -1.0), "SE": (1.0, 1.0), "SW": (-1.0, 1.0),
}
_OPPOSITE = {"N": "S", "S": "N", "E": "W", "W": "E", "NE": "SW", "SW": "NE", "NW": "SE", "SE": "NW"}

ECONOMY_TICK_EVERY = 3
MIN_GOLD_RESERVE = 500
MIN_PRIMARY_RESERVE = 1000


def _dirs() -> list[str]:
    return _ALL_DIRS if settings.enable_diagonal else _ZONE1_DIRS


def _best_dir(vx: float, vy: float) -> str:
    mag = math.sqrt(vx * vx + vy * vy)
    if mag < 0.01:
        return random.choice(_dirs())
    tx, ty = vx / mag, vy / mag
    return max(_dirs(), key=lambda d: _DIR_VECTORS[d][0] * tx + _DIR_VECTORS[d][1] * ty)


class ExplorerAgent(BaseAgent):
    def __init__(self, ws: SocketIOClient, db: MongoClient | None = None) -> None:
        super().__init__(ws, db=db)
        self.memory = ExplorationMemory(maxlen=200)
        # Ship state
        self._pos: dict | None = None
        self._energy: int = 0
        self._max_energy: int = 30
        self._zone: int = 1
        self._ship_level: int = 1
        self._ship_speed: float = 2000.0
        # Navigation
        self._path: list[str] = []       # directions à suivre
        self._path_reason: str = ""      # pourquoi on suit ce path
        # Spiral (fallback)
        self._spiral_center: tuple[int, int] = (HOME_POSITION["x"], HOME_POSITION["y"])
        self._spiral_angle: float = 2.0 * math.pi
        self._last_dir: str = ""
        # Map grid (pour exploration intelligente)
        self._grid: list[str] = []
        self._grid_min_x: int = 0
        self._grid_max_x: int = 0
        self._grid_min_y: int = 0
        self._grid_max_y: int = 0
        self._grid_width: int = 0
        self._grid_height: int = 0
        self._grid_refresh_counter: int = 0
        # Stats
        self._moves: int = 0
        self._islands_found: int = 0
        self._island_visits: int = 0
        # Îles CONFIRMÉES qui rechargent le fuel (vérifiées par le bot lui-même)
        # HOME est toujours dedans. Les autres sont ajoutées quand un refill est détecté.
        self._refuel_islands: set[tuple[int, int]] = {(HOME_POSITION["x"], HOME_POSITION["y"])}
        # Îles testées qui NE rechargent PAS (éviter de retourner dessus pour fuel)
        self._bad_islands: set[tuple[int, int]] = set()
        self._energy_before_move: int = 0
        # Cellules bloquées (zone boundary) — exclues de l'exploration
        self._blocked_cells: set[tuple[int, int]] = set()
        self._last_move_dir: str = ""  # direction du dernier move envoyé
        # Economy
        self._marketplace: bool = False
        self._primary_resource: str | None = None
        # Orders (commandes du capitaine)
        self._current_order: dict | None = None

    # ══════════════════════════════════════════════════════════════
    # MAIN LOOP
    # ══════════════════════════════════════════════════════════════

    async def loop(self) -> None:
        await self._init()
        # Charger les îles confirmées depuis la DB confirmed_refuel
        await self._load_confirmed_from_db()
        await self._refresh_map_grid()

        while True:
            # Refresh DB et grid seulement toutes les 30 moves (pas chaque tick)
            self._grid_refresh_counter += 1
            if self._grid_refresh_counter >= 30:
                self._grid_refresh_counter = 0
                if self.world:
                    await self.world.refresh()
                await self._refresh_map_grid()

            # ── CHECK ORDERS (commandes du capitaine) ──
            await self._check_orders()

            direction = self._decide()
            self._energy_before_move = self._energy
            self._last_move_dir = direction

            resp = await self._send("ship:move", {"direction": direction})
            if resp.get("status") != "ok":
                await self._on_error(resp.get("error", ""))
                continue

            self._moves += 1
            await self._on_move(direction, resp["data"])

            # Si on exécute un ordre, update le progrès
            if self._current_order and self._pos:
                await self._update_order_progress()

            if self._moves % 50 == 0:
                self._log_status()

            await asyncio.sleep(self._ship_speed / 1000.0)

    # ══════════════════════════════════════════════════════════════
    # INIT
    # ══════════════════════════════════════════════════════════════

    async def _init(self) -> None:
        if self._player_details:
            ship = self._player_details.get("ship", {})
            lvl = ship.get("level", {})
            self._ship_level = lvl.get("id", 1)
            self._ship_speed = lvl.get("speed", 2000)
            self._max_energy = ship.get("availableMove", 30)
            self._marketplace = self._player_details.get("marketPlaceDiscovered", False)
            res = self._player_details.get("resources", [])
            if res:
                self._primary_resource = max(res, key=lambda r: r.get("quantity", 0)).get("type")

        if self.world:
            state = await self.world.get_ship_state(settings.coding_game_id)
            if state:
                self._pos = state["position"]
                self._energy = state.get("energy", 0)
                self._zone = self._pos.get("zone", 1)
                if self._energy > self._max_energy:
                    self._max_energy = self._energy
                if is_island(self._pos):
                    self.memory.mark_island(self._pos)
                    self._spiral_center = (self._pos["x"], self._pos["y"])

        if not self._pos:
            self.memory.mark_island(HOME_POSITION)

        logger.info(
            "\n  ⚓ EXPLORER AGENT STARTED ⚓\n"
            "  Ship: level=%s speed=%sms energy=%s/%s\n"
            "  Position: %s zone=%s\n"
            "  Resource: %s | Marketplace: %s\n"
            "  Known islands: %s | Total cells: %s",
            self._ship_level, self._ship_speed, self._energy, self._max_energy,
            f"({self._pos['x']},{self._pos['y']})" if self._pos else "?", self._zone,
            self._primary_resource or "?", "YES" if self._marketplace else "NO",
            self.world.known_island_count if self.world else "?",
            self.world.cell_count if self.world else "?",
        )

    # ══════════════════════════════════════════════════════════════
    # DECIDE — le coeur de l'algo, appelé à chaque tick
    # ══════════════════════════════════════════════════════════════

    def _decide(self) -> str:
        # ── FUEL CHECK (toujours, en premier, sans exception) ──
        fuel_dir = self._fuel_check()
        if fuel_dir is not None:
            return fuel_dir

        # ── PATH TERMINÉ MAIS PAS SUR SAND → aller sur l'île adjacente ──
        # (seulement pour fuel/validate, PAS pour zone_escape ou explore)
        if not self._path and self._path_reason in ("fuel_emergency", "fuel_proactive", "fuel_guard", "validate"):
            if self._pos and not is_island(self._pos):
                step = self._step_toward_nearest_sand()
                if step:
                    logger.info("🏝️ Pas encore sur l'île — step vers SAND adjacent: %s", step)
                    return step
            self._path_reason = ""

        # ── PATH TERMINÉ (autre raison) → clear ──
        if not self._path and self._path_reason:
            self._path_reason = ""

        # ── PATH EN COURS (validation, retreat, etc.) ──
        if self._path:
            return self._path.pop(0)

        # ── EXPLORATION INTELLIGENTE (basée sur map:grid) ──
        return self._explore()

    def _step_toward_nearest_sand(self) -> str | None:
        """Si le bot est à côté d'une île mais pas dessus, fait un pas vers la SAND la plus proche."""
        if not self._pos or not self.world:
            return None
        px, py = self._pos["x"], self._pos["y"]
        # Chercher dans les cellules adjacentes (1 case)
        best_dir = None
        best_dist = 999
        for d in _dirs():
            dx, dy = _DIR_VECTORS[d]
            nx, ny = int(px + dx), int(py + dy)
            cell = self.world.cell_at(nx, ny)
            if cell and is_island(cell) and (nx, ny) not in self._bad_islands:
                dist = 0  # adjacent direct
                if dist < best_dist:
                    best_dist = dist
                    best_dir = d
        return best_dir

    def _fuel_check(self) -> str | None:
        """Retourne une direction si on doit rentrer pour fuel. None sinon."""
        if not self.world or not self._pos:
            return None

        x, y = self._pos["x"], self._pos["y"]
        buffer = settings.energy_buffer

        # ── DÉJÀ EN ROUTE FUEL → suivre le path sans recalculer ──
        if self._path_reason.startswith("fuel"):
            if self._path:
                return self._path.pop(0)
            # Path vide mais pas sur île → chercher SAND adjacente
            if self._pos and not is_island(self._pos):
                step = self._step_toward_nearest_sand()
                if step:
                    logger.info("🏝️ Fuel path terminé, step vers SAND: %s", step)
                    return step

        # ── Trouver l'île la plus proche QUI N'EST PAS BLACKLISTÉE ──
        nearest = self._find_good_island(x, y)
        dist = _distance(x, y, nearest["x"], nearest["y"], self._zone)

        needs_fuel = False
        reason = ""

        # URGENCE : on peut à peine revenir
        if self._energy <= dist + buffer:
            needs_fuel = True
            reason = "fuel_emergency"
            logger.warning(
                "⛽ URGENCE energy=%s dist=%s+buf=%s → (%s,%s)",
                self._energy, dist, buffer, nearest["x"], nearest["y"],
            )

        # PROACTIF : sous le ratio
        elif self._max_energy > 0 and self._energy < int(self._max_energy * settings.low_fuel_ratio) and dist > 0:
            needs_fuel = True
            reason = "fuel_proactive"
            logger.info(
                "⛽ Proactif energy=%s/%s → (%s,%s) dist=%s",
                self._energy, self._max_energy, nearest["x"], nearest["y"], dist,
            )

        # GARDE : assez pour explorer + revenir ?
        elif self._energy < dist + buffer + 4 and dist > 0:
            needs_fuel = True
            reason = "fuel_guard"
            logger.info(
                "⛽ Garde energy=%s dist=%s → (%s,%s)",
                self._energy, dist, nearest["x"], nearest["y"],
            )

        if needs_fuel:
            self._set_path_to(nearest, reason)
            if self._path:
                return self._path.pop(0)
            return None

        # Fuel OK → clear les paths fuel obsolètes
        if self._path_reason.startswith("fuel"):
            self._path.clear()
            self._path_reason = ""

        return None

    def _find_good_island(self, x: int, y: int) -> dict:
        """Trouve l'île la plus proche pour le fuel.

        PRIORITÉ 1 : îles CONFIRMÉES (refuel_islands) — on SAIT qu'elles rechargent
        PRIORITÉ 2 : n'importe quelle SAND pas blacklistée (tentative)
        FALLBACK   : HOME (toujours fiable)
        """
        # 1. Chercher la plus proche parmi les CONFIRMÉES
        if self._refuel_islands:
            best = None
            best_dist = 9999
            for coords in self._refuel_islands:
                d = _distance(x, y, coords[0], coords[1], self._zone)
                if d < best_dist:
                    best_dist = d
                    best = {"x": coords[0], "y": coords[1]}
            if best and best_dist < 30:  # raisonnable
                return best

        # 2. Sinon, n'importe quelle SAND pas blacklistée (on tentera le refill)
        if self.world:
            candidates = self.world.nearest_islands(x, y, self._zone, n=15, same_zone=True)
            for c in candidates:
                if (c["x"], c["y"]) not in self._bad_islands:
                    return c
            candidates = self.world.nearest_islands(x, y, self._zone, n=15)
            for c in candidates:
                if (c["x"], c["y"]) not in self._bad_islands:
                    return c

        # 3. Fallback HOME
        return HOME_POSITION

    # ══════════════════════════════════════════════════════════════
    # DB RESET & SYNC
    # ══════════════════════════════════════════════════════════════

    async def _load_confirmed_from_db(self) -> None:
        """Charge les îles confirmées depuis la collection confirmed_refuel en DB."""
        self._bad_islands.clear()
        if not self.world or not self.world._db:
            logger.info("🔄 Pas de DB — seul HOME dans refuel_islands")
            return

        docs = await self.world._db.find_many("confirmed_refuel", {}, limit=10000)
        for doc in docs:
            self._refuel_islands.add((doc["x"], doc["y"]))
        logger.info(
            "🔄 %s îles refuel chargées depuis DB (+ HOME)",
            len(self._refuel_islands),
        )

    # ══════════════════════════════════════════════════════════════
    # PATH NAVIGATION
    # ══════════════════════════════════════════════════════════════

    def _set_path_to(self, target: dict, reason: str) -> None:
        if not self._pos:
            return
        self._path = _path_to(
            self._pos["x"], self._pos["y"],
            target["x"], target["y"],
            self._zone,
        )
        self._path_reason = reason
        logger.debug("📍 Path [%s] → (%s,%s) : %s steps", reason, target["x"], target["y"], len(self._path))

    # ══════════════════════════════════════════════════════════════
    # SMART EXPLORATION — basée sur map:grid
    # ══════════════════════════════════════════════════════════════

    async def _refresh_map_grid(self) -> None:
        """Récupère la map grid depuis l'API pour analyser les zones inexplorées."""
        resp = await self._send("map:grid")
        if resp.get("status") != "ok" or not resp.get("data"):
            return
        data = resp["data"]
        self._grid = data.get("grid", [])
        self._grid_min_x = data.get("minX", 0)
        self._grid_max_x = data.get("maxX", 0)
        self._grid_min_y = data.get("minY", 0)
        self._grid_max_y = data.get("maxY", 0)
        self._grid_width = data.get("width", 0)
        self._grid_height = data.get("height", 0)
        logger.info(
            "🗺️ Grid chargée: %sx%s x=[%s,%s] y=[%s,%s]",
            self._grid_width, self._grid_height,
            self._grid_min_x, self._grid_max_x,
            self._grid_min_y, self._grid_max_y,
        )

    def _grid_cell(self, x: int, y: int) -> str:
        """Retourne le code de la cellule à (x,y) dans la grid. '?' si hors limites."""
        if not self._grid:
            return "?"
        row = y - self._grid_min_y
        col = x - self._grid_min_x
        if 0 <= row < len(self._grid) and 0 <= col < len(self._grid[row]):
            return self._grid[row][col]
        return "?"  # hors de la grid = inexploré

    def _find_nearest_unexplored(self) -> dict | None:
        """Trouve la cellule inexplorée (code 0 ou hors grid) la plus proche.

        Scanne en cercles croissants autour du bot.
        Priorise les cellules adjacentes à des cellules connues (frontière).
        """
        if not self._pos:
            return None

        px, py = self._pos["x"], self._pos["y"]
        best = None
        best_dist = 9999

        # Scan en expanding square — frontière d'abord (adjacent à du connu)
        for radius in range(1, 40):
            found_any = False
            for dx in range(-radius, radius + 1):
                for dy in [-radius, radius] if abs(dx) < radius else range(-radius, radius + 1):
                    nx, ny = px + dx, py + dy
                    # Skip les cellules bloquées (zone boundary)
                    if (nx, ny) in self._blocked_cells:
                        continue
                    cell = self._grid_cell(nx, ny)
                    if cell != "0" and cell != "?":
                        continue  # déjà exploré

                    # Est-ce en frontière ? (adjacent à une cellule connue)
                    is_frontier = False
                    for fdx, fdy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        neighbor = self._grid_cell(nx + fdx, ny + fdy)
                        if neighbor not in ("0", "?"):
                            is_frontier = True
                            break

                    dist = _distance(px, py, nx, ny, self._zone)
                    # Frontière = priorité (distance / 2)
                    score = dist if not is_frontier else dist * 0.5
                    if score < best_dist:
                        best_dist = score
                        best = {"x": nx, "y": ny}
                        found_any = True

            if found_any and best_dist < radius * 0.7:
                break  # trouvé quelque chose de proche, pas besoin de chercher plus loin

        return best

    def _explore(self) -> str:
        """Direction d'exploration intelligente basée sur la grid."""
        if not self._pos:
            return random.choice(_dirs())

        # Chercher la zone inexplorée la plus proche
        target = self._find_nearest_unexplored()

        if target:
            px, py = self._pos["x"], self._pos["y"]
            vx = target["x"] - px
            vy = target["y"] - py
            if abs(vx) > 0.01 or abs(vy) > 0.01:
                d = _best_dir(float(vx), float(vy))
                # Anti-oscillation
                if d == _OPPOSITE.get(self._last_dir):
                    # Essayer la 2ème meilleure direction
                    dirs = _dirs()
                    scored = sorted(dirs, key=lambda dd: -(
                        _DIR_VECTORS[dd][0] * vx + _DIR_VECTORS[dd][1] * vy
                    ))
                    for alt in scored:
                        if alt != _OPPOSITE.get(self._last_dir):
                            d = alt
                            break
                self._last_dir = d
                return d

        # Fallback : spirale si aucune zone inexplorée trouvée
        return self._spiral_fallback()

    def _spiral_fallback(self) -> str:
        """Spirale de fallback si la grid ne révèle pas de zone inexplorée."""
        if not self._pos:
            return random.choice(_dirs())

        cx, cy = self._spiral_center
        px, py = self._pos["x"], self._pos["y"]

        vx, vy = 0.0, 0.0
        for _ in range(32):
            self._spiral_angle += settings.spiral_angle_step
            r = settings.spiral_growth * self._spiral_angle / (2.0 * math.pi)
            tx = cx + r * math.cos(self._spiral_angle)
            ty = cy + r * math.sin(self._spiral_angle)
            vx, vy = tx - px, ty - py
            if math.sqrt(vx * vx + vy * vy) >= 3.0:
                break

        d = _best_dir(vx, vy)
        if d == _OPPOSITE.get(self._last_dir):
            self._spiral_angle += settings.spiral_angle_step * 4
            r = settings.spiral_growth * self._spiral_angle / (2.0 * math.pi)
            tx = cx + r * math.cos(self._spiral_angle)
            ty = cy + r * math.sin(self._spiral_angle)
            d = _best_dir(tx - px, ty - py)

        self._last_dir = d
        return d

    # ══════════════════════════════════════════════════════════════
    # MOVE PROCESSING
    # ══════════════════════════════════════════════════════════════

    async def _on_move(self, direction: str, data: dict) -> None:
        pos = data["position"]
        energy = data["energy"]

        self.memory.record(Move(direction=direction, position=pos, energy=energy,
                                discovered_cells=data.get("discoveredCells", [])))
        self._pos = pos
        self._energy = energy
        self._zone = pos.get("zone", self._zone)

        bar = self._bar(energy)
        logger.info(
            "⛵ %s → (%s,%s) z%s %s %s/%s +%scells [%s]",
            direction, pos["x"], pos["y"], self._zone,
            bar, energy, self._max_energy,
            len(data.get("discoveredCells", [])),
            self._path_reason or "explore",
        )

        if energy <= 0 and not is_island(pos):
            logger.error("🚨 STRANDED energy=0")
            await self._on_stranded()
            return

        if is_island(pos):
            await self._on_island(data)

    async def _on_island(self, data: dict) -> None:
        pos = data["position"]
        ix, iy = pos["x"], pos["y"]
        self._island_visits += 1

        self.memory.mark_island(pos)
        self._spiral_center = (ix, iy)
        self._grid_refresh_counter = 30  # force refresh au prochain tick

        energy = data["energy"]
        # Refill OK si : énergie a augmenté OU on était déjà plein (max = pas de refill visible)
        already_full = self._energy_before_move >= self._max_energy
        refilled = energy > self._energy_before_move or already_full

        # Énergie max tracking
        if energy > self._max_energy:
            self._max_energy = energy

        # ── REFILL CHECK : est-ce que l'île a rechargé le fuel ? ──
        if refilled:
            # ✅ Cette île recharge → l'ajouter à la whitelist confirmée
            self._refuel_islands.add((ix, iy))
            self._bad_islands.discard((ix, iy))
            logger.info(
                "🏝️ ÎLE (%s,%s) — REFILL OK %s→%s (%s refuel islands confirmées)",
                ix, iy, self._energy_before_move, energy, len(self._refuel_islands),
            )

            # Clear fuel/validate path
            if self._path_reason.startswith("fuel") or self._path_reason == "validate":
                if self._path_reason == "validate":
                    logger.info("✅ VALIDATION effectuée sur île (%s,%s)", ix, iy)
                self._path.clear()
                self._path_reason = ""

            # Economy tick
            if self._island_visits % ECONOMY_TICK_EVERY == 0:
                await self._economy_tick()
        else:
            # ⚠️ PAS DE REFILL — cette île ne recharge pas
            self._bad_islands.add((ix, iy))
            logger.warning(
                "⚠️ ÎLE (%s,%s) PAS DE REFILL (energy %s→%s) — BLACKLISTÉE (%s bad, %s good)",
                ix, iy, self._energy_before_move, energy,
                len(self._bad_islands), len(self._refuel_islands),
            )
            # Si on était en route fuel → chercher une AUTRE île immédiatement
            if self._path_reason.startswith("fuel"):
                self._path.clear()
                self._path_reason = ""
                logger.info("🔄 Recherche d'une autre île pour fuel...")

            # Nouvelle île → programmer validation vers une île confirmée
            self._islands_found += 1
            logger.info("🆕 ÎLE #%s (%s,%s) — retour pour validation", self._islands_found, ix, iy)
            self._schedule_validation(ix, iy)

    def _schedule_validation(self, ix: int, iy: int) -> None:
        """Programme un retour vers l'île CONFIRMÉE (refuel) la plus proche pour valider."""
        # Utiliser les îles confirmées (pas la DB) — seules celles-ci valident les découvertes
        target = None
        best_dist = 9999
        for coords in self._refuel_islands:
            d = _distance(ix, iy, coords[0], coords[1], self._zone)
            if d < best_dist:
                best_dist = d
                target = {"x": coords[0], "y": coords[1]}
        if not target:
            target = HOME_POSITION

        dist = _distance(ix, iy, target["x"], target["y"], self._zone)
        # Seulement si on a assez d'énergie
        if self._energy > dist + settings.energy_buffer:
            self._set_path_to(target, "validate")
            logger.info("🔙 Validation → (%s,%s) dist=%s", target["x"], target["y"], dist)
        else:
            logger.info("⚠️ Pas assez d'énergie pour valider — sera fait au prochain passage")

    # ══════════════════════════════════════════════════════════════
    # ERROR & STRANDED
    # ══════════════════════════════════════════════════════════════

    async def _on_error(self, error: str) -> None:
        logger.warning("⚠️ ERREUR: %s", error)

        if "GAME_OVER_INSERT_COINS" in error or "amende" in error.lower():
            if settings.auto_pay_fines:
                await self._handle_fine()
            await asyncio.sleep(5.0)
            return

        if "zone" in error.lower() and "accéder" in error.lower():
            self._path.clear()
            self._path_reason = ""

            if self._pos and self._last_move_dir:
                dx, dy = _DIR_VECTORS.get(self._last_move_dir, (0, 0))
                px, py = self._pos["x"], self._pos["y"]
                # Blacklister un MUR de cellules perpendiculaire à la direction bloquée
                # + les cellules en profondeur derrière le mur
                for depth in range(1, 10):
                    for lateral in range(-15, 16):
                        if dx != 0:  # direction E/W → mur vertical
                            bx = int(px + dx * depth)
                            by = int(py + lateral)
                        else:  # direction N/S → mur horizontal
                            bx = int(px + lateral)
                            by = int(py + dy * depth)
                        self._blocked_cells.add((bx, by))
                logger.info(
                    "🚧 Zone boundary dir=%s — mur bloqué (total %s blocked cells)",
                    self._last_move_dir, len(self._blocked_cells),
                )

            # Tenter un upgrade pour débloquer la zone
            nr = await self._send("ship:next-level")
            if nr.get("status") == "ok" and nr.get("data"):
                nlid = nr["data"].get("level", {}).get("id")
                if nlid and nlid > self._ship_level:
                    ur = await self._send("ship:upgrade", {"level": nlid})
                    if ur.get("status") == "ok":
                        self._ship_level = nlid
                        self._blocked_cells.clear()
                        logger.info("⬆️ UPGRADE level %s — zones débloquées!", nlid)
                        return
                    logger.info("⬆️ Upgrade échoué — pas assez de ressources")

            # Forcer un move latéral pour sortir de la boundary
            if self._pos:
                laterals = [d for d in _dirs() if d != self._last_move_dir and d != _OPPOSITE.get(self._last_move_dir, "")]
                if laterals:
                    self._path = [random.choice(laterals)] * 3  # 3 pas latéraux
                    self._path_reason = "zone_escape"
                    logger.info("↔️ Escape latéral: %s", self._path)

            await asyncio.sleep(2.0)
            return

        # Erreur inconnue → reculer vers l'île la plus proche
        if self.world and self._pos:
            nearest = self.world.find_nearest_island(
                self._pos["x"], self._pos["y"], self._zone, same_zone=True,
            )
            if nearest:
                self._set_path_to(nearest, "fuel_emergency")
        await asyncio.sleep(3.0)

    async def _on_stranded(self) -> None:
        logger.info("🚨 STRANDED — paiement amende + attente...")
        if settings.auto_pay_fines:
            await self._handle_fine()
        await asyncio.sleep(15.0)
        # Tenter un move
        d = random.choice(_dirs())
        resp = await self._send("ship:move", {"direction": d})
        if resp.get("status") == "ok":
            logger.info("✅ Sorti du stranding!")
            await self._on_move(d, resp["data"])
        else:
            logger.info("⏳ Toujours stranded...")

    # ══════════════════════════════════════════════════════════════
    # ECONOMY
    # ══════════════════════════════════════════════════════════════

    async def _economy_tick(self) -> None:
        logger.info("💹 Economy tick")
        resp = await self._send("player:details")
        if resp.get("status") != "ok":
            return
        details = resp["data"]
        money = details.get("money", 0)
        resources = {r["type"]: r["quantity"] for r in details.get("resources", [])}
        self._marketplace = details.get("marketPlaceDiscovered", False)

        logger.info("💰 Money=%s | %s", money, " ".join(f"{k}={v}" for k, v in resources.items()))

        # Storage upgrade
        sr = await self._send("storage:next-level")
        if sr.get("status") == "ok" and sr.get("data"):
            cost = sr["data"].get("costResources", {})
            if cost and all(resources.get(r, 0) >= a for r, a in cost.items()):
                ur = await self._send("storage:upgrade")
                if ur.get("status") == "ok":
                    logger.info("📦 STORAGE UPGRADE → %s", sr["data"].get("name"))

        # Ship upgrade
        nr = await self._send("ship:next-level")
        if nr.get("status") == "ok" and nr.get("data"):
            cost = nr["data"].get("costResources", {})
            nlid = nr["data"].get("level", {}).get("id")
            if nlid and nlid > self._ship_level and cost:
                if all(resources.get(r, 0) >= a for r, a in cost.items()):
                    ur = await self._send("ship:upgrade", {"level": nlid})
                    if ur.get("status") == "ok":
                        self._ship_level = nlid
                        self._ship_speed = nr["data"].get("level", {}).get("speed", self._ship_speed)
                        self._max_energy = nr["data"].get("level", {}).get("maxMovement", self._max_energy)
                        logger.info("🚢 SHIP UPGRADE level %s!", nlid)

        # Marketplace
        if self._marketplace and self._primary_resource:
            await self._marketplace_tick(money, resources)

    async def _marketplace_tick(self, money: int, resources: dict) -> None:
        primary = self._primary_resource
        primary_qty = resources.get(primary, 0)

        # Vendre surplus
        if primary_qty > MIN_PRIMARY_RESERVE + 500:
            offers = await self._send("marketplace:offers")
            if offers.get("status") == "ok":
                my = [o for o in offers.get("data", []) if o.get("owner", {}).get("name") == self._player_details.get("name")]
                if not my:
                    qty = min(primary_qty - MIN_PRIMARY_RESERVE, 2000)
                    r = await self._send("marketplace:create-offer", {
                        "resourceType": primary, "quantityIn": qty, "pricePerResource": 2,
                    })
                    if r.get("status") == "ok":
                        logger.info("🏪 VENTE %s x%s", primary, qty)

        # Acheter manquantes
        if money < MIN_GOLD_RESERVE:
            return
        needed = {"BOISIUM", "FERONIUM", "CHARBONIUM"} - {primary}
        offers_r = await self._send("marketplace:offers")
        if offers_r.get("status") != "ok":
            return
        gold = money - MIN_GOLD_RESERVE
        for res in needed:
            if resources.get(res, 0) > 1000:
                continue
            best = [o for o in offers_r.get("data", [])
                    if o.get("resourceType") == res and o.get("owner", {}).get("name") != self._player_details.get("name")]
            if not best:
                continue
            offer = min(best, key=lambda o: o.get("pricePerResource", 999))
            price = offer.get("pricePerResource", 999)
            if price > 5:
                continue
            qty = min(offer.get("quantityIn", 0), gold // price, 1000)
            if qty < 50:
                continue
            r = await self._send("marketplace:purchase", {"offerId": offer["id"], "quantity": qty})
            if r.get("status") == "ok":
                gold -= qty * price
                logger.info("🏪 ACHAT %s x%s @ %s", res, qty, price)

    # ══════════════════════════════════════════════════════════════
    # ORDERS (commandes du capitaine via capitain:go-to)
    # ══════════════════════════════════════════════════════════════

    async def _check_orders(self) -> None:
        """Poll les ordres en attente depuis la DB via l'API."""
        # Ne pas checker si on exécute déjà un ordre
        if self._current_order:
            return

        resp = await self._send("capitain:status")
        if resp.get("status") != "ok" or not resp.get("data"):
            return

        order = resp["data"]
        if order.get("status") != "PENDING":
            return

        # Nouvel ordre trouvé !
        self._current_order = order
        target = order.get("payload", {}).get("coordinates", {})
        tx, ty = target.get("x"), target.get("y")

        if tx is None or ty is None:
            logger.warning("🎯 Ordre invalide (pas de coordonnées): %s", order.get("id"))
            await self._send("capitain:progress", {
                "orderId": order["id"],
                "status": "FAILED",
                "error": "Coordonnées manquantes",
            })
            self._current_order = None
            return

        logger.info(
            "🎯 ══ ORDRE DU CAPITAINE ══ → (%s,%s) id=%s",
            tx, ty, order["id"],
        )

        # Mettre l'ordre en IN_PROGRESS
        dist = _distance(self._pos["x"], self._pos["y"], tx, ty, self._zone) if self._pos else 0
        await self._send("capitain:progress", {
            "orderId": order["id"],
            "status": "IN_PROGRESS",
            "message": f"En route vers ({tx},{ty}) — {dist} moves estimés",
            "progress": {
                "target": {"x": tx, "y": ty},
                "current": {"x": self._pos["x"], "y": self._pos["y"]} if self._pos else None,
                "stepsRemaining": dist,
                "stepsTotal": dist,
                "message": f"Départ — distance {dist}",
            },
        })

        # Set le path vers la cible
        self._set_path_to({"x": tx, "y": ty}, "order")

    async def _update_order_progress(self) -> None:
        """Met à jour le progrès de l'ordre en cours."""
        if not self._current_order or not self._pos:
            return

        order = self._current_order
        target = order.get("payload", {}).get("coordinates", {})
        tx, ty = target.get("x"), target.get("y")
        if tx is None or ty is None:
            return

        dist = _distance(self._pos["x"], self._pos["y"], tx, ty, self._zone)
        total = order.get("_total_steps", dist)
        if "_total_steps" not in order:
            order["_total_steps"] = dist + len(self._path)

        # Arrivé ?
        if dist <= 1:
            logger.info(
                "🎯 ══ ORDRE COMPLÉTÉ ══ arrivé à (%s,%s)!",
                tx, ty,
            )
            await self._send("capitain:progress", {
                "orderId": order["id"],
                "status": "COMPLETED",
                "message": f"Arrivé à ({tx},{ty})",
                "progress": {
                    "target": {"x": tx, "y": ty},
                    "current": {"x": self._pos["x"], "y": self._pos["y"]},
                    "stepsRemaining": 0,
                    "stepsTotal": total,
                    "message": "Destination atteinte",
                },
            })
            self._current_order = None
            self._path.clear()
            self._path_reason = ""
            return

        # Progrès périodique (toutes les 5 moves)
        if self._moves % 5 == 0:
            await self._send("capitain:progress", {
                "orderId": order["id"],
                "status": "IN_PROGRESS",
                "message": f"En route — {dist} moves restants",
                "progress": {
                    "target": {"x": tx, "y": ty},
                    "current": {"x": self._pos["x"], "y": self._pos["y"]},
                    "stepsRemaining": dist,
                    "stepsTotal": total,
                    "message": f"En route — {dist} moves restants",
                },
            })

        # Si le path est vide mais on n'est pas arrivé → recalculer
        if not self._path and dist > 1:
            self._set_path_to({"x": tx, "y": ty}, "order")

    # ══════════════════════════════════════════════════════════════
    # UTILS
    # ══════════════════════════════════════════════════════════════

    def _bar(self, e: int) -> str:
        if self._max_energy <= 0:
            return "[??????????]"
        f = int(e / self._max_energy * 10)
        return "[" + "█" * f + "░" * (10 - f) + "]"

    def _log_status(self) -> None:
        logger.info(
            "\n┌─── #%s ─────────────────────────┐\n"
            "│ Pos: (%s,%s) z%s energy=%s/%s\n"
            "│ Path: %s [%s]\n"
            "│ Islands: %s found, %s visits\n"
            "│ Known: %s | Total cells: %s\n"
            "└────────────────────────────────┘",
            self._moves,
            self._pos["x"] if self._pos else "?", self._pos["y"] if self._pos else "?",
            self._zone, self._energy, self._max_energy,
            len(self._path), self._path_reason or "none",
            self._islands_found, self._island_visits,
            self.world.known_island_count if self.world else "?",
            self.world.cell_count if self.world else "?",
        )
