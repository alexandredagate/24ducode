"""
Client MongoDB abstrait — permissif, pas de schéma imposé.
Utilise Motor (async) pour s'intégrer proprement avec FastAPI.
"""
from typing import Any

from fastapi import Request, Depends
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument


class MongoClient:
    def __init__(self, uri: str, db_name: str):
        self._uri = uri
        self._db_name = db_name
        self._client: AsyncIOMotorClient | None = None

    async def connect(self):
        self._client = AsyncIOMotorClient(self._uri)

    async def close(self):
        if self._client:
            self._client.close()

    async def ping(self) -> bool:
        try:
            await self._client.admin.command("ping")
            return True
        except Exception:
            return False

    def col(self, collection: str):
        return self._client[self._db_name][collection]

    async def find_one(self, collection: str, query: dict) -> dict | None:
        return await self.col(collection).find_one(query, {"_id": 0})

    async def find_many(self, collection: str, query: dict, limit: int = 100, sort: list[tuple] | None = None) -> list[dict]:
        cursor = self.col(collection).find(query, {"_id": 0})
        if sort:
            cursor = cursor.sort(sort)
        return await cursor.to_list(length=limit)

    async def insert_one(self, collection: str, doc: dict) -> str:
        result = await self.col(collection).insert_one(doc)
        return str(result.inserted_id)

    async def upsert(self, collection: str, query: dict, update: dict) -> dict | None:
        return await self.col(collection).find_one_and_update(
            query, {"$set": update}, upsert=True, return_document=ReturnDocument.AFTER
        )

    async def delete_one(self, collection: str, query: dict) -> int:
        result = await self.col(collection).delete_one(query)
        return result.deleted_count

    async def delete_many(self, collection: str, query: dict) -> int:
        result = await self.col(collection).delete_many(query)
        return result.deleted_count

    async def count(self, collection: str, query: dict | None = None) -> int:
        return await self.col(collection).count_documents(query or {})

    def raw(self, collection: str):
        """Retourne la collection Motor brute pour les aggregations / bulk ops."""
        return self.col(collection)


def get_db() -> Any:
    def _dep(request: Request) -> MongoClient:
        return request.app.state.db
    return Depends(_dep)
