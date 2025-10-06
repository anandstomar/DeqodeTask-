
import uvicorn
from fastapi import FastAPI, Request, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json

from agent_service import run_full, stream_run

app = FastAPI(title="Finance Agent Backend")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RunRequest(BaseModel):
    user_id: str
    thread_id: str
    question: str

@app.post("/api/agent/run")
async def api_run(req: RunRequest):
    """
    Blocking call — runs the workflow fully and returns the final report.
    """
    try:
        result = run_full(req.question, user_id=req.user_id, thread_id=req.thread_id)
        return JSONResponse(content={"status":"ok", "result": result})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/agent/stream")
async def api_stream(req: RunRequest):
    """
    SSE streaming endpoint. Client should listen to text/event-stream.
    Each event is JSON in the form: {event: str, payload: ...}
    """
    generator = stream_run(req.question, user_id=req.user_id, thread_id=req.thread_id)
    return StreamingResponse(generator, media_type="text/event-stream")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
