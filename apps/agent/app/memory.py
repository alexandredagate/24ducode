"""Mémoire d'exploration — conserve les 200 derniers déplacements."""
from collections import deque
from dataclasses import dataclass, field

HOME_POSITION: dict = {"x": 5, "y": 3}

_DIR_VECTORS: dict[str, tuple[int, int]] = {
    "N":  ( 0, -1),
    "S":  ( 0,  1),
    "E":  ( 1,  0),
    "W":  (-1,  0),
    "NE": ( 1, -1),
    "NW": (-1, -1),
    "SE": ( 1,  1),
    "SW": (-1,  1),
}
_ZONE1_DIRS: list[str] = ["N", "S", "E", "W"]
_ALL_DIRS: list[str] = list(_DIR_VECTORS.keys())


def _available(_zone: int) -> list[str]:
    from app.config import settings
    return _ALL_DIRS if settings.enable_diagonal else _ZONE1_DIRS


def _distance(x: int, y: int, tx: int, ty: int, zone: int) -> int:
    """Distance selon le modèle de mouvement réel (Manhattan si cardinales seules, Chebyshev si diagonales)."""
    from app.config import settings
    if not settings.enable_diagonal or zone == 1:
        return abs(tx - x) + abs(ty - y)
    return max(abs(tx - x), abs(ty - y))


def _path_to(sx: int, sy: int, tx: int, ty: int, zone: int) -> list[str]:
    """Chemin glouton de (sx,sy) vers (tx,ty) selon les directions disponibles."""
    x, y = sx, sy
    dirs = _available(zone)
    path: list[str] = []
    limit = _distance(x, y, tx, ty, zone) + 50  # marge de sécurité
    while (x != tx or y != ty) and len(path) < limit:
        best = min(dirs, key=lambda d, cx=x, cy=y: _distance(
            cx + _DIR_VECTORS[d][0], cy + _DIR_VECTORS[d][1], tx, ty, zone
        ))
        path.append(best)
        x += _DIR_VECTORS[best][0]
        y += _DIR_VECTORS[best][1]
    return path


@dataclass
class Move:
    direction: str
    position: dict          # Cell: {id, x, y, type, zone}
    energy: int
    discovered_cells: list[dict] = field(default_factory=list)


class ExplorationMemory:
    def __init__(self, maxlen: int = 200) -> None:
        self._moves: deque[Move] = deque(maxlen=maxlen)
        # Initialisé à la maison (x=5, y=3) — valeur de repli si aucune île visitée.
        self._last_island_pos: dict = dict(HOME_POSITION)

    @property
    def moves(self) -> list[Move]:
        return list(self._moves)

    def record(self, move: Move) -> None:
        self._moves.append(move)

    def mark_island(self, pos: dict | None = None) -> None:
        """Marque la position courante comme île connue."""
        if pos is not None:
            self._last_island_pos = {"x": pos["x"], "y": pos["y"]}

    def last_known_island_position(self) -> dict:
        """Retourne la dernière position d'île connue (ou la maison par défaut x=5,y=3)."""
        return self._last_island_pos

    def distance_to_island(self, current_pos: dict, zone: int) -> int:
        """Distance directe entre la position actuelle et la dernière île connue."""
        t = self._last_island_pos
        return _distance(current_pos["x"], current_pos["y"], t["x"], t["y"], zone)

    def return_path_to_island(self, current_pos: dict, zone: int) -> list[str]:
        """Chemin direct vers la dernière île connue depuis la position actuelle."""
        t = self._last_island_pos
        return _path_to(current_pos["x"], current_pos["y"], t["x"], t["y"], zone)

    def path_to(self, current_pos: dict, target_pos: dict, zone: int) -> list[str]:
        """Chemin glouton vers une cible arbitraire."""
        return _path_to(
            current_pos["x"], current_pos["y"],
            target_pos["x"], target_pos["y"],
            zone,
        )

    def distance_to(self, current_pos: dict, target_pos: dict, zone: int) -> int:
        """Distance zone-aware vers une cible arbitraire."""
        return _distance(
            current_pos["x"], current_pos["y"],
            target_pos["x"], target_pos["y"],
            zone,
        )
