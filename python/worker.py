import redis
import json
import re
import os
import time
from agent_service import run_full, stream_run
import threading  
from http.server import HTTPServer, BaseHTTPRequestHandler


REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
NS = os.environ.get("CHECKPOINT_NS", "financeResearch")
JOB_QUEUE = f"{NS}:job_queue"


DATA_PREFIX_RE = re.compile(r'^\s*data:\s*', flags=re.IGNORECASE)
SPLIT_SSE_RE = re.compile(r'\r?\n\s*\r?\n')  


r = redis.from_url(REDIS_URL, decode_responses=True)
ps = r.pubsub(ignore_subscribe_messages=True)
ps.subscribe(JOB_QUEUE)
print(f"Worker subscribed to {JOB_QUEUE}")

class HealthCheckHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-type", "text/plain")
        self.end_headers() 
        self.wfile.write(b"Worker is running")

def start_dummy_server():
    port = int(os.environ.get("PORT", 10000))
    server = HTTPServer(('0.0.0.0', port), HealthCheckHandler)
    print(f"Dummy health check server listening on port {port}")
    server.serve_forever()

threading.Thread(target=start_dummy_server, daemon=True).start()


def _publish_object(channel: str, obj: object):
    """
    Publish a Python object as JSON to Redis. Catch and log publish errors.
    """
    try:
        r.publish(channel, json.dumps(obj, default=str))
    except Exception as e:
        
        print("Worker publish failed:", e)


def _process_and_publish_raw_chunk(event_channel: str, raw_chunk: str):
    """
    Handle a raw string/bytes chunk returned by stream_run.
    Splits into SSE blocks, strips 'data:' prefixes, attempts to parse JSON,
    falls back to wrapping as {"raw": "<text>"} if parsing fails.
    """
    if raw_chunk is None:
        return

    raw_chunk = str(raw_chunk)

    
    blocks = [b.strip() for b in SPLIT_SSE_RE.split(raw_chunk) if b.strip()]

    for block in blocks:
        
        data_lines = []
        for line in block.splitlines():
            line = line.rstrip()
            if not line:
                continue
            if DATA_PREFIX_RE.match(line):
                
                data_lines.append(DATA_PREFIX_RE.sub('', line, count=1))
            else:
                data_lines.append(line)

        merged = "\n".join(data_lines).strip()
        if not merged:
            continue

        
        parsed = None
        try:
            parsed = json.loads(merged)
            _publish_object(event_channel, parsed)
            continue
        except Exception:
            
            
            jstart = merged.find('{')
            jend = merged.rfind('}')
            if jstart != -1 and jend != -1 and jend > jstart:
                candidate = merged[jstart:jend + 1]
                try:
                    parsed = json.loads(candidate)
                    _publish_object(event_channel, parsed)
                    continue
                except Exception:
                    
                    pass

        
        _publish_object(event_channel, {"raw": merged})


def _process_and_publish_event(event, event_channel: str):
    """
    Accept event which may be:
      - dict / list (already structured) -> publish directly
      - bytes -> decode and pass to raw handler
      - string -> parse / handle SSE lines
      - other -> cast to string and handle
    """
    
    if isinstance(event, (dict, list)):
        _publish_object(event_channel, event)
        return

    
    if isinstance(event, bytes):
        try:
            s = event.decode("utf-8", errors="replace")
        except Exception:
            s = str(event)
    else:
        s = str(event)

    
    s_stripped = s.strip()
    if not s_stripped:
        return

    
    try:
        parsed = json.loads(s_stripped)
        _publish_object(event_channel, parsed)
        return
    except Exception:
        
        _process_and_publish_raw_chunk(event_channel, s_stripped)



for msg in ps.listen():
    if msg is None:
        time.sleep(0.01)
        continue

    if msg.get("type") != "message":
        
        continue

    try:
        raw = msg.get("data")
        
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8", errors="replace")
        job = json.loads(raw)

        user_id = job.get("user_id")
        thread_id = job.get("thread_id")
        question = job.get("question")
        event_channel = job.get("channel")  

        if not event_channel:
            print("Worker: missing event channel in job, skipping:", job)
            continue

        print(f"🧠 Running job for {user_id} / {thread_id}: {question}")

        
        _publish_object(event_channel, {"event": "info", "payload": {"message": "worker_started"}})

        
        
        try:
            for event in stream_run(question, user_id=user_id, thread_id=thread_id):
                try:
                    _process_and_publish_event(event, event_channel)
                except Exception as e:
                    
                    print("Worker: error while processing event chunk:", e)
                    _publish_object(event_channel, {"event": "error", "payload": {"message": str(e)}})
        except Exception as e:
            
            print("Worker: stream_run raised an exception:", e)
            _publish_object(event_channel, {"event": "error", "payload": {"message": str(e)}})

        
        _publish_object(event_channel, {"event": "end_of_stream"})
        print(f"🧠 Job completed for {user_id} / {thread_id} -> published end_of_stream to {event_channel}")

    except Exception as e:
        
        print("Worker error:", e)
        try:
            
            if 'event_channel' in locals() and event_channel:
                _publish_object(event_channel, {"event": "error", "payload": {"message": str(e)}})
        except Exception:
            pass

















































