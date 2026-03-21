"""Boucle de décision — reçoit les états du serveur, calcule et envoie les actions.

Calculs CPU-bound (OR-Tools, scipy...) délégués à ProcessPoolExecutor.
Appels IO-bound (LLM, HTTP...) lancés directement en async.
"""
import asyncio
import logging
from concurrent.futures import ProcessPoolExecutor

from app.ws_client import WSClient

logger = logging.getLogger(__name__)

_executor = ProcessPoolExecutor()


def heavy_compute(state: dict) -> dict:
    """Calcul synchrone lourd — exécuté dans un process séparé pour ne pas bloquer la boucle."""
    # TODO: implémenter OR-Tools / scipy
    return {"action": "wait"}


class Agent:
    def __init__(self, ws: WSClient):
        self.ws = ws

    async def on_message(self, msg: dict):
        logger.debug("Message reçu : %s", msg)
        loop = asyncio.get_running_loop()
        action = await loop.run_in_executor(_executor, heavy_compute, msg)
        await self.ws.send(action)
