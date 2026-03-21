import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.agent import AgentV1
from app.config import settings
from app.db import MongoClient, get_db
from app.ws_client import SocketIOClient

logger = logging.getLogger(__name__)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)


async def _run_agent_loop() -> None:
    """Run the agent with automatic reconnection on failure."""
    attempt = 0
    while True:
        attempt += 1
        ws = SocketIOClient(reconnect_delay=settings.ws_reconnect_delay)
        agent = AgentV1(ws)
        logger.info("Démarrage boucle agent (tentative #%s)", attempt)
        try:
            await agent.run()
        except asyncio.CancelledError:
            logger.info("Arrêt demandé: fermeture propre de l'agent")
            await ws.disconnect()
            raise
        except Exception as exc:
            logger.error(
                "Agent erreur : %s — reconnexion dans %ss",
                exc,
                settings.ws_reconnect_delay,
            )
            try:
                await ws.disconnect()
            except Exception:
                pass
            await asyncio.sleep(settings.ws_reconnect_delay)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "Initialisation service agent | api_url=%s | mongo_db=%s | reconnect_delay=%ss",
        settings.api_url,
        settings.mongo_db,
        settings.ws_reconnect_delay,
    )
    app.state.db = MongoClient(settings.mongo_uri, settings.mongo_db)
    await app.state.db.connect()
    logger.info("Connexion MongoDB établie")

    app.state.agent_task = asyncio.create_task(_run_agent_loop())

    yield

    logger.info("Arrêt service agent")
    app.state.agent_task.cancel()
    await app.state.db.close()


app = FastAPI(title="3026 Agent", lifespan=lifespan)


@app.get("/")
async def root():
    return {"service": "3026-agent", "status": "ok"}


@app.get("/health")
async def health(db: MongoClient = get_db()):
    db_ok = await db.ping()
    agent_ok = not app.state.agent_task.done()
    status = {
        "db": "ok" if db_ok else "unreachable",
        "agent": "running" if agent_ok else "stopped",
    }
    return JSONResponse(status, status_code=200 if (db_ok and agent_ok) else 503)
