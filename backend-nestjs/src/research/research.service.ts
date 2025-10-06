
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { RedisService } from '../common/redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { StartRequest } from './interfaces/research.interface';
import * as http from 'http';
import * as https from 'https';

@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);
  private readonly pythonBase: string;
  private readonly checkpointNs: string;
  private readonly activeRuns: Set<string> = new Set<string>();

  private readonly httpAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 30000 });
  private readonly httpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 30000 });

  constructor(
    private readonly redisService: RedisService,
    private readonly config: ConfigService,
  ) {
    this.pythonBase = this.config.get<string>('PY_AGENT_BASE_URL') || 'http://localhost:8000';
    this.checkpointNs = this.config.get<string>('CHECKPOINT_NS') || 'financeResearch';
  }

  private checkpointKey(userId: string, threadId: string) {
    return `${this.checkpointNs}:${userId}:${threadId}`;
  }

  async runBlocking(req: StartRequest) {
    const url = `${this.pythonBase}/api/agent/run`;
    const payload = { user_id: req.user_id, thread_id: req.thread_id, question: req.question };
    const resp = await axios.post(url, payload, { timeout: 120000 });
    const result = resp.data;
    try {
      const finalState = result?.result || result;
      await this.redisService.setKey(this.checkpointKey(req.user_id, req.thread_id), JSON.stringify(finalState));
    } catch (err) {
      this.logger.error('Failed to save checkpoint', err);
    }
    return result;
  }

  async startStreamAndPublish(req: StartRequest) {
    if (!req || !req.user_id || !req.thread_id) {
      throw new Error('Invalid args for startStreamAndPublish');
    }

    const runId = `${req.user_id}:${req.thread_id}`;
    const channel = `${this.checkpointNs}:${req.user_id}:${req.thread_id}:events`;
    const jobQueue = `${this.checkpointNs}:job_queue`;

    if (this.activeRuns?.has(runId)) {
      this.logger.log(`startStreamAndPublish: run already active for ${runId}`);
      return { channel, checkpoint_key: this.checkpointKey(req.user_id, req.thread_id) };
    }

    this.activeRuns.add(runId);

    const job = {
      type: 'research_run',
      user_id: req.user_id,
      thread_id: req.thread_id,
      question: req.question ?? null,
      channel,
      createdAt: new Date().toISOString(),
    };

    try {
      await this.redisService.publish(jobQueue, JSON.stringify(job));
      this.logger.log(`Published job for ${runId} to ${jobQueue}`);

      const cleanupListener = async (_ch: string, raw: string) => {
        try {
          const obj = JSON.parse(raw);
          if (obj?.event === 'finished' || obj?.event === 'error' || obj?.event === 'end_of_stream' || obj?.event === 'complete') {
            this.logger.log(`Received terminal event for ${runId} (${obj.event}). Clearing active run.`);
            this.activeRuns.delete(runId);
            try { await this.redisService.unsubscribe(channel, cleanupListener); } catch (e) { /* ignore */ }
          }
        } catch (e) {
        }
      };

      await this.redisService.subscribe(channel, cleanupListener);

      const SAFETY_MS = (Number(process.env.RUN_ACTIVE_TIMEOUT_MINUTES || '60')) * 60 * 1000;
      setTimeout(() => {
        if (this.activeRuns.has(runId)) {
          this.logger.warn(`Active run ${runId} expired by safety timeout`);
          this.activeRuns.delete(runId);
          this.redisService.unsubscribe(channel, cleanupListener).catch(() => { });
        }
      }, SAFETY_MS);

      return { channel, checkpoint_key: this.checkpointKey(req.user_id, req.thread_id) };
    } catch (err) {
      this.activeRuns.delete(runId);
      this.logger.error('Failed to publish job', err instanceof Error ? err.stack : String(err));
      throw err;
    }
  }


  private async consumePythonSSEAndPublish(req: StartRequest) {
    const url = `${this.pythonBase}/api/agent/stream`;
    const channel = `${this.checkpointNs}:${req.user_id}:${req.thread_id}:events`;
    const maxRetries = 3;
    const baseDelayMs = 1000;

    const publishErrorEvent = async (errPayload: any) => {
      try {
        await this.redisService.publish(channel, JSON.stringify({ event: 'error', payload: errPayload }));
      } catch (e) {
        this.logger.error('Failed to publish error event to redis', e);
      }
    };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.logger.log(`Attempt ${attempt}/${maxRetries} - Connecting to Python agent stream: ${url} with ${JSON.stringify(req)}`);

      try {
        const axiosResp = await axios.post(
          url,
          { user_id: req.user_id, thread_id: req.thread_id, question: req.question },
          {
            responseType: 'stream',
            timeout: 0,
            headers: {
              Accept: 'text/event-stream',
              'Connection': 'keep-alive',
            },
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          }
        );

        this.logger.log(`Python SSE connected (status=${axiosResp.status})`);

        await this.redisService.publish(channel, JSON.stringify({ event: 'info', payload: { message: 'connected-to-python', status: axiosResp.status } }));

        const stream = axiosResp.data as NodeJS.ReadableStream;
        let buffer = '';

        let endedCleanly = false;


        stream.on('error', (err: any) => {
          this.logger.error('Error in python SSE stream (stream error)', err?.message ?? err);
        });

        stream.on('close', (hadError?: boolean) => {
          this.logger.log('Python SSE stream closed (close event). hadError=' + hadError);
        });

        stream.on('data', async (chunk: Buffer) => {
          try {
            buffer += chunk.toString('utf8');

            while (true) {
              const idx = buffer.indexOf('\n\n');
              if (idx === -1) break;
              const rawEvent = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 2);
              const lines = rawEvent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

              for (const line of lines) {
                if (!line.startsWith('data:')) continue;


                const jsonStrCandidate = line.replace(/^data:\s*/, '');

                try {

                  let parsed: any;
                  try {
                    parsed = JSON.parse(jsonStrCandidate);
                  } catch (parseErr) {

                    const maybeStripped = jsonStrCandidate.replace(/^data:\s*/i, '').trim();
                    try {
                      parsed = JSON.parse(maybeStripped);
                    } catch (e2) {

                      parsed = { raw: jsonStrCandidate };
                    }
                  }


                  let publishObj = parsed;
                  if (publishObj && typeof publishObj === 'object' && typeof publishObj.raw === 'string') {
                    let innerRaw = publishObj.raw.trim();

                    if (innerRaw.toLowerCase().startsWith('data:')) {
                      innerRaw = innerRaw.replace(/^data:\s*/i, '').trim();
                    }

                    try {
                      const innerParsed = JSON.parse(innerRaw);
                      publishObj = innerParsed;
                    } catch (innerParseErr) {

                      publishObj = { raw: innerRaw };
                    }
                  }


                  await this.redisService.publish(channel, JSON.stringify(publishObj));


                  if (publishObj?.payload) {
                    const evt = publishObj.event;
                    if (evt === 'node_output' || evt === 'finished' || evt === 'checkpoint') {
                      try {
                        const ck = this.checkpointKey(req.user_id, req.thread_id);
                        const existing = await this.redisService.getKey(ck);
                        let state = existing ? JSON.parse(existing) : {};
                        const payload = publishObj.payload;

                        if (payload?.report) state.report = payload.report;
                        if (payload?.final_text) state.report = payload.final_text;
                        if (payload?.draft_preview) state.draft = payload.draft_preview;
                        if (payload?.sources) state.sources = payload.sources;
                        if (payload?.question) state.question = payload.question;
                        state.updatedAt = new Date().toISOString();
                        await this.redisService.setKey(ck, JSON.stringify(state));
                      } catch (ckErr) {
                        this.logger.warn('Failed to update checkpoint from publishObj', ckErr);
                      }
                    }
                  }
                } catch (e) {

                  this.logger.warn('Failed to parse/publish SSE data chunk (line-level)', e);
                }
              }
            }
          } catch (e) {
            this.logger.warn('Error processing SSE data chunk (outer)', e);
          }
        });


        stream.on('end', () => {
          endedCleanly = true;
          this.logger.log('Python SSE stream ended (end event).');
        });


        await new Promise<void>((resolve, reject) => {
          stream.on('end', () => resolve());
          stream.on('close', () => resolve());

          stream.on('error', (err) => reject(err));
        });


        if (endedCleanly) {
          this.logger.log('Python SSE completed cleanly; not retrying.');
          return;
        } else {

          this.logger.warn('Python SSE connection closed unexpectedly; will retry if attempts remain.');

          await this.redisService.publish(channel, JSON.stringify({ event: 'info', payload: { message: 'stream disconnected, retrying' } }));
        }
      } catch (err: any) {

        this.logger.error(`Python SSE connection attempt ${attempt} failed: ${err?.message ?? err}`);
        if (err?.response) {

          try {
            const data = await new Promise(resolve => {
              const chunks: any[] = [];
              err.response.data.on('data', (chunk: any) => chunks.push(chunk));
              err.response.data.on('end', () => resolve(Buffer.concat(chunks).toString()));
              err.response.data.on('error', () => resolve('Failed to read response data'));
            });
            this.logger.error(`Python response status=${err.response.status} data=${data}`);
          } catch (e) {
            this.logger.error('Error reading err.response.data', e);
          }
        }
        if (err?.code) {
          this.logger.error(`Axios error code: ${err.code}`);
        }

        if (attempt === maxRetries) {
          await publishErrorEvent({ message: 'Failed to connect to Python agent stream after retries', detail: String(err?.message ?? err) });
          this.logger.error('Exhausted Python SSE reconnect attempts.');
          return;
        } else {

          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          this.logger.log(`Retrying python SSE in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
    }
  }


  async getCheckpoint(user_id: string, thread_id: string) {
    const key = this.checkpointKey(user_id, thread_id);
    const raw = await this.redisService.getKey(key);
    return raw ? JSON.parse(raw) : null;
  }
}