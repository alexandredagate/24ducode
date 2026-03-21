"""Agent registry — ajoutez vos nouvelles versions ici."""
from app.agents.base import BaseAgent
from app.agents.v1 import AgentV1
from app.agents.v2 import AgentV2

AGENTS: dict[str, type[BaseAgent]] = {
    "v1": AgentV1,
    "v2": AgentV2,
}


def get_agent(version: str, ws, db=None) -> BaseAgent:
    """Instancie l'agent correspondant à la version demandée."""
    cls = AGENTS.get(version)
    if cls is None:
        available = ", ".join(sorted(AGENTS.keys()))
        raise ValueError(f"Version d'agent inconnue : '{version}' (disponibles : {available})")
    return cls(ws, db=db)
