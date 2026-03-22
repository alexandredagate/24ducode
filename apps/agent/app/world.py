"""Représentation de la carte du monde à partir de la base MongoDB.

WorldMap charge toutes les cellules connues (collection `cells`) et la position
du bateau (collection `ship_position`) pour fournir une vue d'ensemble de la
carte réelle, indépendante de la mémoire courte de l'agent.

Distinction KNOWN vs DISCOVERED :
- KNOWN   = île validée, recharge le fuel, sert de point de retour
- DISCOVERED = île vue mais pas encore validée, NE recharge PAS le fuel

Recherche par chunk :
- On cherche les îles dans un carré de CHUNK_SIZE autour du bateau
- Si rien trouvé, on double le chunk jusqu'à MAX_CHUNK_SIZE
- Toujours la plus proche en premier
"""
import logging

from app.db import MongoClient

logger = logging.getLogger(__name__)

_ISLAND_TYPES: frozenset[str] = frozenset({"SAND"})

# Taille initiale du chunk de recherche (16x16 autour du bateau = ±8)
CHUNK_SIZE: int = 16
# Taille max du chunk (au-delà, on prend tout)
MAX_CHUNK_SIZE: int = 128


def _distance(x: int, y: int, tx: int, ty: int, zone: int) -> int:
    """Distance selon le modèle de mouvement réel."""
    from app.config import settings
    if not settings.enable_diagonal:
        return abs(tx - x) + abs(ty - y)
    return max(abs(tx - x), abs(ty - y))


def _is_known(cell: dict) -> bool:
    return cell.get("type") in _ISLAND_TYPES and cell.get("discoveryStatus") == "KNOWN"


def _is_any_island(cell: dict) -> bool:
    return cell.get("type") in _ISLAND_TYPES


def _in_chunk(cell: dict, cx: int, cy: int, half: int) -> bool:
    """True si la cellule est dans le carré [cx-half, cx+half] x [cy-half, cy+half]."""
    return abs(cell["x"] - cx) <= half and abs(cell["y"] - cy) <= half


class WorldMap:
    def __init__(self, db: MongoClient) -> None:
        self._db = db
        self._cells: dict[tuple[int, int], dict] = {}
        self._all_islands: list[dict] = []
        self._known_islands: list[dict] = []

    # ------------------------------------------------------------------
    # DB
    # ------------------------------------------------------------------

    async def refresh(self) -> None:
        cells = await self._db.find_many("cells", {}, limit=100_000)
        self._cells = {(c["x"], c["y"]): c for c in cells}
        self._all_islands = [c for c in cells if _is_any_island(c)]
        self._known_islands = [c for c in cells if _is_known(c)]

    async def get_ship_state(self, coding_game_id: str) -> dict | None:
        return await self._db.find_one(
            "ship_position", {"codingGameId": coding_game_id}
        )

    # ------------------------------------------------------------------
    # Recherche par chunk — expanding square
    # ------------------------------------------------------------------

    def find_nearest_known_island(
        self, x: int, y: int, zone: int, *, same_zone: bool = False
    ) -> dict | None:
        """Cherche l'île KNOWN la plus proche en expandant par chunks.

        1. Chunk 16x16 autour du bateau
        2. Si rien → 32x32 → 64x64 → 128x128
        3. Si toujours rien → recherche globale
        4. Toujours triée par distance, la plus proche gagne
        """
        chunk_half = CHUNK_SIZE // 2
        while chunk_half <= MAX_CHUNK_SIZE // 2:
            candidates = [
                c for c in self._known_islands
                if _in_chunk(c, x, y, chunk_half)
                and (not same_zone or c.get("zone") == zone)
            ]
            if candidates:
                best = min(candidates, key=lambda c: _distance(x, y, c["x"], c["y"], zone))
                logger.debug(
                    "🔍 Île KNOWN trouvée dans chunk %sx%s : (%s,%s) dist=%s",
                    chunk_half * 2, chunk_half * 2,
                    best["x"], best["y"],
                    _distance(x, y, best["x"], best["y"], zone),
                )
                return best
            chunk_half *= 2

        # Fallback global (hors chunk)
        candidates = self._known_islands if not same_zone else [
            c for c in self._known_islands if c.get("zone") == zone
        ]
        if candidates:
            return min(candidates, key=lambda c: _distance(x, y, c["x"], c["y"], zone))

        return None

    def find_nearest_island(
        self, x: int, y: int, zone: int, *, same_zone: bool = False
    ) -> dict | None:
        """Cherche l'île la plus proche (KNOWN ou DISCOVERED) par chunks."""
        chunk_half = CHUNK_SIZE // 2
        while chunk_half <= MAX_CHUNK_SIZE // 2:
            candidates = [
                c for c in self._all_islands
                if _in_chunk(c, x, y, chunk_half)
                and (not same_zone or c.get("zone") == zone)
            ]
            if candidates:
                return min(candidates, key=lambda c: _distance(x, y, c["x"], c["y"], zone))
            chunk_half *= 2

        candidates = self._all_islands if not same_zone else [
            c for c in self._all_islands if c.get("zone") == zone
        ]
        if candidates:
            return min(candidates, key=lambda c: _distance(x, y, c["x"], c["y"], zone))
        return None

    # ------------------------------------------------------------------
    # Bulk queries (pour refuel on path, etc.)
    # ------------------------------------------------------------------

    def known_islands_in_chunk(
        self, x: int, y: int, zone: int, chunk_size: int = CHUNK_SIZE
    ) -> list[dict]:
        """Retourne toutes les îles KNOWN dans un chunk autour de (x,y)."""
        half = chunk_size // 2
        return [
            c for c in self._known_islands
            if _in_chunk(c, x, y, half) and c.get("zone") == zone
        ]

    def nearest_known_islands(
        self, x: int, y: int, zone: int, n: int = 5, *, same_zone: bool = False
    ) -> list[dict]:
        """Retourne les n îles KNOWN les plus proches (pour compatibilité)."""
        candidates = self._known_islands if not same_zone else [
            i for i in self._known_islands if i.get("zone") == zone
        ]
        if not candidates:
            return []
        return sorted(
            candidates,
            key=lambda c: _distance(x, y, c["x"], c["y"], zone),
        )[:n]

    def nearest_islands(
        self, x: int, y: int, zone: int, n: int = 5, *, same_zone: bool = False
    ) -> list[dict]:
        """Retourne les n îles les plus proches (KNOWN + DISCOVERED)."""
        candidates = self._all_islands if not same_zone else [
            i for i in self._all_islands if i.get("zone") == zone
        ]
        if not candidates:
            return []
        return sorted(
            candidates,
            key=lambda c: _distance(x, y, c["x"], c["y"], zone),
        )[:n]

    # ------------------------------------------------------------------
    # Lookups
    # ------------------------------------------------------------------

    def cell_at(self, x: int, y: int) -> dict | None:
        return self._cells.get((x, y))

    def is_known_island(self, x: int, y: int) -> bool:
        cell = self._cells.get((x, y))
        return cell is not None and _is_known(cell)

    def all_islands(self) -> list[dict]:
        return list(self._all_islands)

    def islands_in_zone(self, zone: int) -> list[dict]:
        return [i for i in self._all_islands if i.get("zone") == zone]

    def known_islands_in_zone(self, zone: int) -> list[dict]:
        return [i for i in self._known_islands if i.get("zone") == zone]

    def max_known_zone(self) -> int:
        if not self._all_islands:
            return 1
        return max(i.get("zone", 1) for i in self._all_islands)

    @property
    def cell_count(self) -> int:
        return len(self._cells)

    @property
    def island_count(self) -> int:
        return len(self._all_islands)

    @property
    def known_island_count(self) -> int:
        return len(self._known_islands)
