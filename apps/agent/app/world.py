"""Représentation de la carte du monde à partir de la base MongoDB.

WorldMap charge toutes les cellules connues (collection `cells`) et la position
du bateau (collection `ship_position`) pour fournir une vue d'ensemble de la
carte réelle, indépendante de la mémoire courte de l'agent.
"""
from app.db import MongoClient

_ISLAND_TYPES: frozenset[str] = frozenset({"SAND"})


def _distance(x: int, y: int, tx: int, ty: int, zone: int) -> int:
    """Distance selon le modèle de mouvement réel (Manhattan si cardinales seules, Chebyshev si diagonales)."""
    from app.config import settings
    if not settings.enable_diagonal or zone == 1:
        return abs(tx - x) + abs(ty - y)
    return max(abs(tx - x), abs(ty - y))


class WorldMap:
    """Vue de la carte construite depuis MongoDB.

    Usage typique :
        world = WorldMap(db)
        await world.refresh()               # charge / recharge depuis la DB
        nearest = world.nearest_islands(x, y, zone)
        ship    = await world.get_ship_state(coding_game_id)
    """

    def __init__(self, db: MongoClient) -> None:
        self._db = db
        self._cells: dict[tuple[int, int], dict] = {}  # (x, y) -> cell
        self._islands: list[dict] = []                  # cellules SAND uniquement

    # ------------------------------------------------------------------
    # Requêtes DB
    # ------------------------------------------------------------------

    async def refresh(self) -> None:
        """Recharge toutes les cellules connues depuis la collection `cells`."""
        cells = await self._db.find_many("cells", {}, limit=100_000)
        self._cells = {(c["x"], c["y"]): c for c in cells}
        self._islands = [c for c in cells if c.get("type") in _ISLAND_TYPES]

    async def get_ship_state(self, coding_game_id: str) -> dict | None:
        """Retourne {position, energy, updatedAt} depuis `ship_position`, ou None."""
        return await self._db.find_one(
            "ship_position", {"codingGameId": coding_game_id}
        )

    # ------------------------------------------------------------------
    # Requêtes sur la carte en mémoire (après refresh)
    # ------------------------------------------------------------------

    def nearest_islands(
        self, x: int, y: int, zone: int, n: int = 5
    ) -> list[dict]:
        """Retourne les n îles (SAND) les plus proches par distance zone-aware."""
        if not self._islands:
            return []
        return sorted(
            self._islands,
            key=lambda c: _distance(x, y, c["x"], c["y"], zone),
        )[:n]

    def cell_at(self, x: int, y: int) -> dict | None:
        """Lookup O(1) d'une cellule par coordonnées."""
        return self._cells.get((x, y))

    def all_islands(self) -> list[dict]:
        """Retourne toutes les îles connues."""
        return list(self._islands)

    def islands_in_zone(self, zone: int) -> list[dict]:
        """Retourne les îles appartenant à une zone donnée."""
        return [i for i in self._islands if i.get("zone") == zone]

    def islands_by_zone(self) -> dict[int, list[dict]]:
        """Retourne les îles groupées par zone."""
        result: dict[int, list[dict]] = {}
        for i in self._islands:
            z = i.get("zone", 1)
            result.setdefault(z, []).append(i)
        return result

    def max_known_zone(self) -> int:
        """Retourne la zone la plus haute contenant au moins une île connue."""
        if not self._islands:
            return 1
        return max(i.get("zone", 1) for i in self._islands)

    @property
    def cell_count(self) -> int:
        return len(self._cells)

    @property
    def island_count(self) -> int:
        return len(self._islands)
