from app.agents.base import BaseAgent
from app.agents.explorer import ExplorerAgent

AGENTS: dict[str, type[BaseAgent]] = {
    "v2": ExplorerAgent,
    "explorer": ExplorerAgent,
}


def get_agent(version: str, ws, db=None) -> BaseAgent:
    cls = AGENTS.get(version)
    if cls is None:
        available = ", ".join(sorted(AGENTS.keys()))
        raise ValueError(f"Version d'agent inconnue : '{version}' (disponibles : {available})")
    return cls(ws, db=db)
