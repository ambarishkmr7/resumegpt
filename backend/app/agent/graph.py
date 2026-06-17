"""LangGraph Agent with LinkedIn MCP tools + Postgres memory."""

from __future__ import annotations

import logging
import os
import datetime
from typing import Any

from langchain.agents import create_agent
from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.tools import StructuredTool

from app.agent.memory import get_checkpointer, get_store
from app.config import get_settings
from app.mcp_server import mcp as mcp_server

logger = logging.getLogger(__name__)


def extract_string_content(content: Any) -> str:
    """Safely extract string content from LangChain's message content field."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        text_parts = []
        for block in content:
            if isinstance(block, str):
                text_parts.append(block)
            elif isinstance(block, dict):
                if block.get("type") == "text" and "text" in block:
                    text_parts.append(block["text"])
                elif "text" in block:
                    text_parts.append(block["text"])
        return "".join(text_parts)
    return str(content) if content is not None else ""


def _get_mcp_tools():
    """Extract tools from the local FastMCP server."""
    tools = []
    try:
        tool_manager = getattr(mcp_server, '_tool_manager', None)
        if tool_manager:
            for name, tool_obj in tool_manager._tools.items():
                func = getattr(tool_obj, 'fn', tool_obj)
                tools.append(
                    StructuredTool.from_function(
                        func=func,
                        name=name,
                        description=getattr(func, '__doc__', '') or '',
                    )
                )
    except Exception as exc:
        logger.warning("Failed to extract MCP tools: %s", exc)

    return tools


_SYSTEM_PROMPT = """You are a career assistant for ResumeGPT. You help users find jobs on LinkedIn, research companies, and get career advice.

You have access to LinkedIn tools to:
- Search for jobs with filters (location, experience, remote, etc.)
- Get detailed job descriptions
- Search for companies and get company info
- Find jobs at specific companies
- Get popular locations, industries, and job functions

When you find jobs, present them clearly with title, company, location, salary (if available), and whether Easy Apply is available. Always include the job URL so users can apply.

Be conversational and helpful. If the user asks about their resume or career path, give specific advice based on their background.

IMPORTANT: When using tools, always actually call them — don't just describe what you would do. After getting tool results, summarize them naturally using Markdown bullet points and bold text.
"""


def _build_agent(checkpointer, store):
    """Build and return a compiled LangGraph agent with MCP tools + memory."""
    settings = get_settings()

    if settings.GEMINI_API_KEY:
        os.environ.setdefault("GEMINI_API_KEY", settings.GEMINI_API_KEY)
        os.environ.setdefault("GOOGLE_API_KEY", settings.GEMINI_API_KEY)
    if settings.ANTHROPIC_API_KEY:
        os.environ.setdefault("ANTHROPIC_API_KEY", settings.ANTHROPIC_API_KEY)

    model_name = settings.AI_MODEL or "google_genai:gemini-flash-lite-latest"
    if ":" not in model_name and "gemini" in model_name.lower():
        model_name = f"google_genai:{model_name}"

    llm = init_chat_model(
        model=model_name,
        temperature=0.7,
        max_tokens=2000,
    )

    tools = _get_mcp_tools()
    logger.info("Building agent with model=%s tools=%d", model_name, len(tools))

    return create_agent(
        model=llm,
        tools=tools,
        system_prompt=_SYSTEM_PROMPT,
        checkpointer=checkpointer,
        store=store,
    )


async def agent_chat(user_id: str, thread_id: str, message: str) -> dict[str, Any]:
    """Send a message to the agent and return the response."""
    checkpointer = await get_checkpointer()
    store = await get_store()
    agent = _build_agent(checkpointer, store)

    config = {
        "configurable": {
            "thread_id": thread_id,
            "user_id": user_id,
        }
    }

    result = await agent.ainvoke(
        {"messages": [HumanMessage(content=message)]},
        config=config,
    )

    messages = result.get("messages", [])
    
    last_ai = None
    for m in reversed(messages):
        if isinstance(m, AIMessage):
            last_ai = m
            break

    response_text = extract_string_content(last_ai.content) if last_ai else "I'm sorry, I couldn't process that request."

    # --- NEW: Save thread metadata to Store so History loads properly ---
    try:
        # Preserve the title of the FIRST question asked in this thread
        existing_item = await store.aget(("agent_threads", user_id), thread_id)
        if existing_item and existing_item.value and existing_item.value.get("title"):
            title = existing_item.value["title"]
        else:
            title = message[:35] + "..." if len(message) > 35 else message

        preview = response_text[:50] + "..." if len(response_text) > 50 else response_text
        thread_data = {
            "thread_id": thread_id,
            "title": title,
            "last_message": preview,
            "updated_at": datetime.datetime.utcnow().isoformat()
        }
        await store.aput(("agent_threads", user_id), thread_id, thread_data)
    except Exception as e:
        logger.warning("Failed to save thread metadata to store: %s", e)
    # --------------------------------------------------------------------

    serialized = []
    for m in messages:
        role = "assistant" if isinstance(m, AIMessage) else "user" if isinstance(m, HumanMessage) else "tool"
        serialized.append({
            "role": role,
            "content": extract_string_content(m.content),
            "id": getattr(m, 'id', None),
        })

    return {
        "response": response_text,
        "thread_id": thread_id,
        "messages": serialized,
    }