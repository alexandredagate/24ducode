"""Représentation de la carte du monde à partir de la base MongoDB.

WorldMap charge toutes les cellules connues (collection `cells`) et la position
du bateau (collection `ship_position`) pour fournir une vue d'ensemble de la
carte réelle, indépendante de la mémoire courte de l'agent.

Distinction KNOWN vs DISCOVERED :
- KNOWN   = île validée, recharge le fuel, sert de point de retour
- DISCOVERED = île vue mais pas encore validée, NE recharge PAS le fuel
"""
from app.db import MongoClient

_ISLAND_TYPES: frozenset[str] = frozenset({"SAND"})


def _distance(x: int, y: int, tx: int, ty: int, zone: int) -> int:
    """Distance selon le modèle de mouvement réel (Manhattan si cardinales seules, Chebyshev si diagonales)."""
    from app.config import settings
    if not settings.enable_diagonal or zone == 1:
        return abs(tx - x) + abs(ty - y)
    return max(abs(tx - x), abs(ty - y))


def _is_known(cell: dict) -> bool:
    """True si la cellule est une île KNOWN (validée)."""
    return cell.get("type") in _ISLAND_TYPES and cell.get("discoveryStatus") == "KNOWN"


def _is_any_island(cell: dict) -> bool:
    """True si la cellule est SAND (KNOWN ou DISCOVERED)."""
    return cell.get("type") in _ISLAND_TYPES


class WorldMap:
    """Vue de la carte construite depuis MongoDB.

    Usage typique :
        world = WorldMap(db)
        await world.refresh()
        nearest = world.nearest_known_islands(x, y, zone)
        ship    = await world.get_ship_state(coding_game_id)
    """

    def __init__(self, db: MongoClient) -> None:
        self._db = db
        self._cells: dict[tuple[int, int], dict] = {}
        self._all_islands: list[dict] = []    # toutes les SAND (KNOWN + DISCOVERED)
        self._known_islands: list[dict] = []  # seulement les KNOWN (validées)

    # ------------------------------------------------------------------
    # Requêtes DB
    # ------------------------------------------------------------------

    async def refresh(self) -> None:
        """Recharge toutes les cellules connues depuis la collection `cells`."""
        cells = await self._db.find_many("cells", {}, limit=100_000)
        self._cells = {(c["x"], c["y"]): c for c in cells}
        self._all_islands = [c for c in cells if _is_any_island(c)]
        self._known_islands = [c for c in cells if _is_known(c)]

    async def get_ship_state(self, coding_game_id: str) -> dict | None:
        return await self._db.find_one(
            "ship_position", {"codingGameId": coding_game_id}
        )

    # ------------------------------------------------------------------
    # Requêtes sur la carte en mémoire (après refresh)
    # ------------------------------------------------------------------

    def nearest_known_islands(
        self, x: int, y: int, zone: int, n: int = 5, *, same_zone: bool = False
    ) -> list[dict]:
        """Retourne les n îles KNOWN (validées) les plus proches.
        Ce sont les seules qui rechargent le fuel.
        """
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
        """Retourne les n îles (KNOWN + DISCOVERED) les plus proches.
        Pour l'exploration / navigation générale (pas le fuel).
        """
        candidates = self._all_islands if not same_zone else [
            i for i in self._all_islands if i.get("zone") == zone
        ]
        if not candidates:
            return []
        return sorted(
            candidates,
            key=lambda c: _distance(x, y, c["x"], c["y"], zone),
        )[:n]

    def cell_at(self, x: int, y: int) -> dict | None:
        return self._cells.get((x, y))

    def is_known_island(self, x: int, y: int) -> bool:
        """True si la cellule à (x,y) est une île KNOWN."""
        cell = self._cells.get((x, y))
        return cell is not None and _is_known(cell)

    def all_islands(self) -> list[dict]:
        return list(self._all_islands)

    def islands_in_zone(self, zone: int) -> list[dict]:
        return [i for i in self._all_islands if i.get("zone") == zone]

    def known_islands_in_zone(self, zone: int) -> list[dict]:
        return [i for i in self._known_islands if i.get("zone") == zone]

    def islands_by_zone(self) -> dict[int, list[dict]]:
        result: dict[int, list[dict]] = {}
        for i in self._all_islands:
            z = i.get("zone", 1)
            result.setdefault(z, []).append(i)
        return result

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
