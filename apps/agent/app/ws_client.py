"""Client Socket.IO sortant — connexion vers le serveur de jeu."""
import asyncio
import logging

import socketio

logger = logging.getLogger(__name__)


class SocketIOClient:
    def __init__(self, reconnect_delay: float = 3.0) -> None:
        self.reconnect_delay = reconnect_delay
        self._sio = socketio.AsyncClient(
            reconnection=False,
            logger=False,
            engineio_logger=False,
        )
        self._pending: asyncio.Future | None = None
        self._access_token: str | None = None
        self._refresh_token: str | None = None
        self._connected = False

        @self._sio.on("connect")
        async def _on_connect():
            self._connected = True
            logger.info("Socket.IO connecté")

        @self._sio.on("disconnect")
        async def _on_disconnect():
            self._connected = False
            logger.warning("Socket.IO déconnecté")

        @self._sio.on("response")
        async def _on_response(*args):
            data = args[0] if args else {}
            logger.debug("Réponse : %s", data)
            if self._pending and not self._pending.done():
                self._pending.set_result(data)

    @property
    def connected(self) -> bool:
        return self._connected

    def set_tokens(self, access_token: str, refresh_token: str) -> None:
        self._access_token = access_token
        self._refresh_token = refresh_token

    async def connect(self, url: str) -> None:
        auth = {"token": self._access_token} if self._access_token else {}
        await self._sio.connect(url, auth=auth, transports=["websocket"])

    async def send_command(
        self,
        command: str,
        payload: dict | None = None,
        timeout: float = 30.0,
    ) -> dict:
        loop = asyncio.get_running_loop()
        self._pending = loop.create_future()
        msg: dict = {"command": command}
        if payload is not None:
            msg["payload"] = payload
        await self._sio.emit("message", msg)
        try:
            async with asyncio.timeout(timeout):
                return await self._pending
        except asyncio.TimeoutError:
            raise RuntimeError(f"Timeout en attendant la réponse pour '{command}'")

    async def disconnect(self) -> None:
        if self._connected:
            await self._sio.disconnect()
