"""Stratégies de navigation — extensible via la classe abstraite Strategy."""
import math
import random
from abc import ABC, abstractmethod

from app.memory import ExplorationMemory

ZONE1_DIRS: list[str] = ["N", "S", "E", "W"]
ALL_DIRS: list[str] = ["N", "S", "E", "W", "NE", "NW", "SE", "SW"]

# Unit vectors for each direction (not normalised — diagonals have magnitude √2).
DIR_VECTORS: dict[str, tuple[float, float]] = {
    "N":  ( 0.0,  1.0),
    "S":  ( 0.0, -1.0),
    "E":  ( 1.0,  0.0),
    "W":  (-1.0,  0.0),
    "NE": ( 1.0,  1.0),
    "NW": (-1.0,  1.0),
    "SE": ( 1.0, -1.0),
    "SW": (-1.0, -1.0),
}


def _normalize(v: tuple[float, float]) -> tuple[float, float]:
    mag = math.sqrt(v[0] ** 2 + v[1] ** 2)
    return (v[0] / mag, v[1] / mag) if mag > 0 else (0.0, 0.0)


def _dot(a: tuple[float, float], b: tuple[float, float]) -> float:
    return a[0] * b[0] + a[1] * b[1]


def available_directions(zone: int) -> list[str]:
    return ZONE1_DIRS if zone == 1 else ALL_DIRS


class Strategy(ABC):
    @abstractmethod
    def next_direction(self, zone: int, memory: ExplorationMemory) -> str:
        """Return the next direction to move given the current zone and memory."""
        ...


class ExplorationV1Strategy(Strategy):
    """Random-vector strategy: pick a random heading, hold it for RENEW_EVERY
    moves, then pick a new one.  The chosen direction is always the available
    direction whose unit vector has the largest dot-product with the target."""

    RENEW_EVERY: int = 10

    def __init__(self) -> None:
        self._target: tuple[float, float] = self._random_vector()
        self._moves_on_target: int = 0

    @staticmethod
    def _random_vector() -> tuple[float, float]:
        angle = random.uniform(0, 2 * math.pi)
        return (math.cos(angle), math.sin(angle))

    def reset_vector(self) -> None:
        """Force a new random heading (e.g. after returning to an island)."""
        self._target = self._random_vector()
        self._moves_on_target = 0

    def next_direction(self, zone: int, memory: ExplorationMemory) -> str:
        if self._moves_on_target >= self.RENEW_EVERY:
            self.reset_vector()

        available = available_directions(zone)
        target_norm = _normalize(self._target)

        best = max(
            available,
            key=lambda d: _dot(_normalize(DIR_VECTORS[d]), target_norm),
        )
        self._moves_on_target += 1
        return best
