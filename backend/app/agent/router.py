"""FastAPI routes for the job search agent."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.agent.graph import agent_chat, extract_string_content
from app.agent.memory import get_checkpointer, get_store
from app.core.deps import get_current_user
from app.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/agent", tags=["agent"])


class ChatRequest(BaseModel):
    message: str
    thread_id: str | None = None


class ChatResponse(BaseModel):
    response: str
    thread_id: str
    messages: list[dict[str, Any]]


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, user: User = Depends(get_current_user)):
    """Send a message to the job search agent."""
    thread_id = request.thread_id or uuid.uuid4().hex

    try:
        result = await agent_chat(
            user_id=user.id,
            thread_id=thread_id,
            message=request.message,
        )
        return ChatResponse(**result)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.exception("Agent chat failed")
        raise HTTPException(status_code=500, detail=f"Agent error: {exc}")


@router.get("/conversations")
async def list_conversations(user: User = Depends(get_current_user)):
    """List all conversation threads for the current user."""
    store = await get_store()
    conversations = []

    try:
        namespace = ("agent_threads", user.id)
        items = await store.asearch(namespace, limit=50)
        for item in items:
            data = item.value
            conversations.append({
                "thread_id": data.get("thread_id", ""),
                "title": data.get("title", "New Chat"),
                "last_message": data.get("last_message", ""),
                "updated_at": data.get("updated_at", ""),
            })
    except Exception as exc:
        logger.warning("Failed to list conversations: %s", exc)

    return {"conversations": conversations}


@router.get("/conversations/{thread_id}")
async def get_conversation(thread_id: str, user: User = Depends(get_current_user)):
    """Get full message history for a conversation thread."""
    checkpointer = await get_checkpointer()

    config = {"configurable": {"thread_id": thread_id, "user_id": user.id}}

    try:
        state = await checkpointer.aget(config)
        if not state:
            raise HTTPException(status_code=404, detail="Conversation not found")

        messages = []
        for m in state.get("channel_values", {}).get("messages", []):
            role = "assistant" if m.type == "ai" else "user" if m.type == "human" else "tool"
            messages.append({
                "role": role,
                "content": extract_string_content(m.content),
                "id": getattr(m, 'id', None),
            })

        return {"thread_id": thread_id, "messages": messages}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to get conversation")
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/conversations/{thread_id}")
async def delete_conversation(thread_id: str, user: User = Depends(get_current_user)):
    """Delete a conversation thread."""
    checkpointer = await get_checkpointer()
    store = await get_store()

    try:
        # 1. Delete thread metadata from the Store (removes it from the sidebar)
        await store.adelete(("agent_threads", user.id), thread_id)
        
        # 2. Try to delete the actual messages/checkpoints
        if hasattr(checkpointer, 'adelete'):
            await checkpointer.adelete({"configurable": {"thread_id": thread_id, "user_id": user.id}})
            
        return {"success": True}
    except Exception as exc:
        logger.exception("Failed to delete conversation")
        raise HTTPException(status_code=500, detail=str(exc))