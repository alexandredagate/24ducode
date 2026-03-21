import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.agent import Agent
from app.config import settings
from app.db import MongoClient, get_db
from app.ws_client import WSClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = MongoClient(settings.mongo_uri, settings.mongo_db)
    await app.state.db.connect()

    ws = WSClient(settings.ws_server_url, settings.ws_reconnect_delay)
    agent = Agent(ws)
    app.state.ws = ws
    app.state.ws_task = asyncio.create_task(ws.connect_and_run(agent.on_message))

    yield

    app.state.ws_task.cancel()
    await ws.stop()
    await app.state.db.close()


app = FastAPI(title="3026 Agent", lifespan=lifespan)


@app.get("/")
async def root():
    return {"service": "3026-agent", "status": "ok"}


@app.get("/health")
async def health(db: MongoClient = get_db()):
    ok = await db.ping()
    ws_ok = app.state.ws.connected
    status = {"db": "ok" if ok else "unreachable", "ws": "connected" if ws_ok else "disconnected"}
    return JSONResponse(status, status_code=200 if (ok and ws_ok) else 503)
