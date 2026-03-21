"""Client WebSocket sortant — connexion vers le serveur de jeu."""
import asyncio
import json
import logging
from typing import Awaitable, Callable

import websockets
from websockets.exceptions import ConnectionClosed

logger = logging.getLogger(__name__)


class WSClient:
    def __init__(self, url: str, reconnect_delay: float = 3.0):
        self.url = url
        self.reconnect_delay = reconnect_delay
        self._ws = None
        self._running = False

    @property
    def connected(self) -> bool:
        return self._ws is not None

    async def connect_and_run(self, on_message: Callable[[dict], Awaitable[None]]):
        """Boucle de connexion avec reconnexion automatique."""
        self._running = True
        while self._running:
            try:
                async with websockets.connect(self.url) as ws:
                    self._ws = ws
                    logger.info("WS connecté : %s", self.url)
                    async for raw in ws:
                        await on_message(json.loads(raw))
            except ConnectionClosed as e:
                logger.warning("WS déconnecté (%s), reconnexion dans %ss", e, self.reconnect_delay)
            except Exception as e:
                logger.error("WS erreur : %s, reconnexion dans %ss", e, self.reconnect_delay)
            finally:
                self._ws = None
            if self._running:
                await asyncio.sleep(self.reconnect_delay)

    async def send(self, data: dict):
        if self._ws:
            await self._ws.send(json.dumps(data))

    async def stop(self):
        self._running = False
        if self._ws:
            await self._ws.close()
