from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from app.db import MongoClient, get_db
from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = MongoClient(settings.mongo_uri, settings.mongo_db)
    await app.state.db.connect()
    yield
    await app.state.db.close()


app = FastAPI(title="3026 Agent", lifespan=lifespan)


@app.get("/")
async def root():
    return {"service": "3026-agent", "status": "ok"}


@app.get("/health")
async def health(db: MongoClient = get_db()):
    ok = await db.ping()
    return JSONResponse({"db": "ok" if ok else "unreachable"}, status_code=200 if ok else 503)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = await ws.receive_json()
            await ws.send_json({"echo": data})
    except WebSocketDisconnect:
        pass
