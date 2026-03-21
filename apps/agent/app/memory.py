"""Mémoire d'exploration — conserve les 30 derniers déplacements."""
from collections import deque
from dataclasses import dataclass, field

OPPOSITE: dict[str, str] = {
    "N": "S", "S": "N",
    "E": "W", "W": "E",
    "NE": "SW", "SW": "NE",
    "NW": "SE", "SE": "NW",
}


@dataclass
class Move:
    direction: str
    position: dict          # Cell: {id, x, y, type, zone}
    energy: int
    discovered_cells: list[dict] = field(default_factory=list)


class ExplorationMemory:
    def __init__(self, maxlen: int = 30) -> None:
        self._moves: deque[Move] = deque(maxlen=maxlen)
        # Number of moves since the last known island.
        # -1 = no island known yet.
        # 0  = current position is an island.
        self._steps_since_island: int = -1

    @property
    def moves(self) -> list[Move]:
        return list(self._moves)

    def record(self, move: Move) -> None:
        self._moves.append(move)
        if self._steps_since_island >= 0:
            self._steps_since_island += 1
            # Island scrolled out of the memory window — treat as unknown.
            if self._steps_since_island >= (self._moves.maxlen or 30):
                self._steps_since_island = -1

    def mark_island(self) -> None:
        """Mark the current position as a known island."""
        self._steps_since_island = 0

    def steps_since_island(self) -> int:
        """Steps needed to retrace back to the last known island.

        Returns len(moves) when no island is tracked, so the safety check
        still triggers correctly even without a known island.
        """
        if self._steps_since_island < 0:
            return len(self._moves)
        return self._steps_since_island

    def return_path(self) -> list[str]:
        """Ordered list of directions to retrace back to the last known island."""
        moves = list(self._moves)
        n = self._steps_since_island
        if n < 0:
            segment = moves           # no island known: retrace everything
        elif n == 0:
            return []                 # already at island
        else:
            segment = moves[-n:]
        return [OPPOSITE[m.direction] for m in reversed(segment)]

    def last_known_island_position(self) -> dict | None:
        moves = list(self._moves)
        n = self._steps_since_island
        if n < 0 or not moves:
            return None
        idx = len(moves) - 1 - n
        return moves[idx].position if idx >= 0 else None
