
import os
import json
import time
from typing import Dict, Any, Generator, List

from dotenv import load_dotenv
import requests

import redis

try:
    from langgraph.graph import StateGraph, END
    from langgraph.checkpoint.redis import RedisSaver
except Exception:
    
    RedisSaver = None


try:
    from langchain_google_genai import ChatGoogleGenerativeAI
except Exception:
    ChatGoogleGenerativeAI = None

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
SERPER_API_KEY = os.getenv("SERPER_API_KEY")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
AGENT_MODEL = os.getenv("AGENT_MODEL", "gemini-2.5-flash")
CHECKPOINT_NS = os.getenv("CHECKPOINT_NS", "financeResearch")


memory = None
if RedisSaver:
    try:
        memory = RedisSaver(REDIS_URL)
    except Exception:
        memory = None


redis_client = redis.from_url(REDIS_URL, decode_responses=True)


llm = None
if ChatGoogleGenerativeAI:
    try:
        llm = ChatGoogleGenerativeAI(
            model=AGENT_MODEL,
            google_api_key=GOOGLE_API_KEY
        )
    except Exception:
        llm = None


class AgentState(dict):
    """Simple dict to hold agent state values."""
    pass


def _compose_key(namespace: str, user_id: str, thread_id: str) -> str:
    
    return f"{namespace}:{user_id}:{thread_id}"

def save_checkpoint(state: Dict[str, Any], user_id: str, thread_id: str) -> bool:
    """
    Save checkpoint using available method:
     1) Try memory.save_checkpoint(...) if RedisSaver exists
     2) Try memory.save(...) or memory.write(...)
     3) Fallback to direct redis SET of JSON at key = {namespace}:{user_id}:{thread_id}
    Returns True on success.
    """
    
    if memory is not None:
        tried = []
        try:
            
            if hasattr(memory, "save_checkpoint"):
                memory.save_checkpoint(state, user_id=user_id, thread_id=thread_id, namespace=CHECKPOINT_NS)
                return True
            if hasattr(memory, "save"):
                
                try:
                    memory.save(CHECKPOINT_NS, f"{user_id}:{thread_id}", state)
                    return True
                except Exception:
                    
                    memory.save(state)
                    return True
            if hasattr(memory, "write"):
                memory.write(CHECKPOINT_NS, f"{user_id}:{thread_id}", state)
                return True
        except Exception:
            pass

    
    try:
        key = _compose_key(CHECKPOINT_NS, user_id, thread_id)
        redis_client.set(key, json.dumps(state))
        return True
    except Exception:
        return False

def load_checkpoint(user_id: str, thread_id: str) -> Dict[str, Any]:
    """
    Load checkpoint using available method or direct Redis read.
    Returns a dict or empty dict if not found.
    """
    
    if memory is not None:
        try:
            if hasattr(memory, "load_checkpoint"):
                data = memory.load_checkpoint(user_id=user_id, thread_id=thread_id, namespace=CHECKPOINT_NS)
                
                if isinstance(data, dict):
                    return data
                if hasattr(data, "state") and isinstance(data.state, dict):
                    return dict(data.state)
        except Exception:
            pass

    
    try:
        key = _compose_key(CHECKPOINT_NS, user_id, thread_id)
        raw = redis_client.get(key)
        if not raw:
            return {}
        return json.loads(raw)
    except Exception:
        return {}


def web_search(query: str, max_results: int = 3) -> List[Dict[str, str]]:
    """
    Uses Serper.dev Google Search API. Returns list of {url, snippet}.
    """
    if not SERPER_API_KEY:
        return [{"url": "error", "snippet": "SERPER_API_KEY not configured"}]

    url = "https://google.serper.dev/search"
    headers = {"X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json"}
    payload = {"q": query, "num": max_results}

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=10)
        response.raise_for_status()
        data = response.json()
        results = []
        for item in data.get("organic", [])[:max_results]:
            results.append({
                "url": item.get("link"),
                "snippet": item.get("snippet", "")[:2000]
            })
        return results
    except Exception as e:
        return [{"url": "error", "snippet": f"Search error: {e}"}]


def search_node(state: AgentState) -> AgentState:
    state["sources"] = web_search(state["question"])
    return state

def draft_node(state: AgentState) -> AgentState:
    context = "\n\n".join([s.get("snippet", "") for s in state.get("sources", [])])
    prompt = f"Based on these sources, draft a financial analysis report:\n\n{context}"
    if llm is not None:
        try:
            res = llm.invoke(prompt)
            draft_text = getattr(res, "content", None) or getattr(res, "text", None) or str(res)
        except Exception:
            draft_text = "LLM invocation failed — placeholder draft."
    else:        
        draft_text = "LLM not available — sample draft generated by fallback."
    state["draft"] = draft_text
    return state

def report_node(state: AgentState) -> AgentState:
    citations = "\n".join([f"- {s.get('url')}" for s in state.get("sources", [])])
    final = f"## Report\n\n{state.get('draft','')}\n\n### Sources\n{citations}"
    state["report"] = final
    return state

def run_full(question: str, user_id: str = "user_default", thread_id: str = "thread_default") -> Dict[str, Any]:
    """
    Blocking run of the nodes; saves checkpoints after each node.
    """
    state = AgentState()
    
    loaded = load_checkpoint(user_id, thread_id)
    if loaded:
        
        state.update(loaded)
    state["question"] = question

    
    state = search_node(state)
    save_checkpoint(state, user_id, thread_id)

    state = draft_node(state)
    save_checkpoint(state, user_id, thread_id)

    state = report_node(state)
    save_checkpoint(state, user_id, thread_id)

    return dict(state)

# get streaming response in chunk size per event
def stream_run(question: str, user_id: str = "user_default", thread_id: str = "thread_default") -> Generator[str, None, None]:
    """
    Yield SSE-like events as strings. Each yielded string should end with '\n\n'.
    """
    print("stream run report...")
    def sse_event(event_type: str, payload: Any) -> str:
        return f"data: {json.dumps({'event': event_type, 'payload': payload})}\n\n"

    state = AgentState()
    loaded = load_checkpoint(user_id, thread_id)
    if loaded:
        state.update(loaded)
    state["question"] = question

    yield sse_event("started", {"question": question, "user_id": user_id, "thread_id": thread_id})

    
    yield sse_event("status", {"node": "search", "message": "running"})
    try:
        state = search_node(state)
        save_checkpoint(state, user_id, thread_id)
        yield sse_event("node_output", {"node": "search", "sources": state.get("sources", [])})
    except Exception as e:
        yield sse_event("error", {"node": "search", "error": str(e)})
        return

    
    yield sse_event("status", {"node": "drafts", "message": "running"})
    try:
        state = draft_node(state)
        save_checkpoint(state, user_id, thread_id)
        draft_preview = (state.get("draft") or "")[:2000]
        yield sse_event("node_output", {"node": "drafts", "draft_preview": draft_preview})
    except Exception as e:
        yield sse_event("error", {"node": "drafts", "error": str(e)})
        return

    
    yield sse_event("status", {"node": "reports", "message": "running"})
    try:
        state = report_node(state)
        save_checkpoint(state, user_id, thread_id)
        yield sse_event("node_output", {"node": "reports", "report": state.get("report")})
    except Exception as e:
        yield sse_event("error", {"node": "reports", "error": str(e)})
        return

    yield sse_event("finished", {"report": state.get("report")})



# def stream_run(question: str, user_id: str = "user_default", thread_id: str = "thread_default") -> Generator[str, None, None]:
    # """
    # Yields raw content strings (tokens) for streaming, and uses non-standard
    # markers for status and output events. Each yielded string ends with a newline,
    # or is the raw token.
    # """
    # # Using a simple marker for non-content events (like status, etc.)
    # def marker_event(event_type: str, payload: Any) -> str:
    #     # Format: <TYPE>:<NODE>:<MESSAGE>\n
    #     if event_type == "started":
    #         return f"\n--- RUN_STARTED ---\nQuestion: {question}\n"
    #     if event_type == "status":
    #         return f"\n--- STATUS:{payload['node']}:{payload['message']} ---\n"
    #     if event_type == "node_output":
    #         # For non-token output, we just yield a status marker for tracking
    #         if "sources" in payload:
    #             # Summarize search results for clean output
    #             return f"\n--- SEARCH_COMPLETE --- Found {len(payload['sources'])} sources.\n"
    #         # Report chunks will stream as raw text too, so we'll handle them below.
    #         return f"\n--- NODE_OUTPUT:{payload['node']} ---\n"
    #     if event_type == "error":
    #         return f"\n--- ERROR:{payload.get('node', 'N/A')}: {payload['error']} ---\n"
    #     if event_type == "finished":
    #         # Final report data is not yielded here to keep it clean.
    #         return "\n--- RUN_FINISHED ---\n"
    #     return ""


    # chunk_size = int(os.getenv("STREAM_CHUNK_SIZE", "200"))

    # state = AgentState()
    # loaded = load_checkpoint(user_id, thread_id)
    # if loaded:
    #     state.update(loaded)
    # state["question"] = question

    # # START EVENT (Yield a simple marker)
    # yield marker_event("started", {"question": question})

    # # --- SEARCH NODE ---
    # yield marker_event("status", {"node": "search", "message": "running"})
    # try:
    #     state = search_node(state)
    #     save_checkpoint(state, user_id, thread_id)
    #     # YIELD a marker for search completion
    #     yield marker_event("node_output", {"node": "search", "sources": state.get("sources", [])})
    # except Exception as e:
    #     yield marker_event("error", {"node": "search", "error": str(e)})
    #     return

    # # --- DRAFT NODE (STREAMING LLM) ---
    # yield marker_event("status", {"node": "drafts", "message": "running"})
    
    # # build prompt
    # prompt = "Based on these sources, draft a financial analysis report:\n\n" + \
    #          "\n\n".join([s.get("snippet", "") for s in state.get("sources", [])])

    # draft_text_accumulator = ""
    # used_streaming = False

    # if llm is not None and hasattr(llm, "stream"):
    #     stream_result = None
    #     try:
    #         print("Running STREAMING mode: Attempting llm.stream...")
    #         stream_result = llm.stream(prompt, stream_mode="messages")
    #     except Exception: # Catch all stream-related failures for a clean fallback
    #         stream_result = None

    #     if stream_result is not None:
    #         try:
    #             # Process the synchronous iterable stream result
    #             for chunk in stream_result:
    #                 token_txt = getattr(chunk, "content", "") 
                    
    #                 if token_txt:
    #                     draft_text_accumulator += token_txt
                        
    #                     # <<< KEY CHANGE: YIELD RAW TOKEN STRING DIRECTLY >>>
    #                     yield token_txt
    #                     used_streaming = True
                
    #             # Add a final newline after streaming content finishes
    #             if used_streaming:
    #                  yield "\n"
    #                  print("Streaming complete.")
                
    #             state["draft"] = draft_text_accumulator

    #         except Exception as e:
    #             yield marker_event("error", {"node": "drafts", "error": f"LLM stream error: {e}"})
    #             state["draft"] = None

    # # Fallback to non-streaming if needed
    # if not used_streaming or state.get("draft") is None:
    #     print("Running FALLBACK mode: Falling back to non-streaming draft_node2") 
    #     state = draft_node(state)
        
    #     # Stream the fallback content in chunks as raw text
    #     draft_text = state.get("draft", "") or ""
    #     if draft_text:
    #         yield f"\n[FALLBACK DRAFT CONTENT]\n"
    #         for i in range(0, len(draft_text), chunk_size):
    #             chunk = draft_text[i:i+chunk_size]
    #             yield chunk
    #         yield "\n"
    #     else:
    #         yield "\n[FALLBACK DRAFT WAS EMPTY]\n"
    
    # save_checkpoint(state, user_id, thread_id)

    # # --- REPORT NODE ---
    # yield marker_event("status", {"node": "reports", "message": "running"})
    # try:
    #     state = report_node(state)
    #     save_checkpoint(state, user_id, thread_id)

    #     report_text = state.get("report", "") or ""
        
    #     # Stream the final report content in chunks (as raw text)
    #     for i in range(0, len(report_text), chunk_size):
    #         chunk = report_text[i:i+chunk_size]
    #         yield chunk
        
    # except Exception as e:
    #     yield marker_event("error", {"node": "reports", "error": str(e)})
    #     return

    # # FINISHED EVENT
    # yield marker_event("finished", {})