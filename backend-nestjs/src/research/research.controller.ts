
import { Controller, Post, Get, Query, Body, Req, Res, UseGuards } from '@nestjs/common';
import { ResearchService } from './research.service';
import { ThreadDto } from '../common/dto/thread.dto';
import { Request, Response } from 'express';
import { Public } from '../common/decorator/public.decorator';
import { RedisService } from '../common/redis/redis.service';

@Controller('research')
export class ResearchController {
  constructor(
    private readonly researchService: ResearchService,
    private readonly redisService: RedisService,
  ) { }

  @Post('run')
  async runBlocking(@Body() body: ThreadDto) {
    const id = `${body.user_id}:${body.thread_id}`;
    const started = await this.researchService.startStreamAndPublish({
      user_id: body.user_id,
      thread_id: body.thread_id,
      question: body.question,
    });
    return { status: 'ok', id };
  }


  @Public()
  @Get('stream')
  async stream(
    @Query('user_id') user_id: string,
    @Query('thread_id') thread_id: string,
    @Query('question') question: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const ns = process.env.CHECKPOINT_NS || 'financeResearch';
    const channel = `${ns}:${user_id}:${thread_id}:events`;
    const checkpointKey = `${ns}:${user_id}:${thread_id}`;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    (res as any).flushHeaders?.();
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(':\n\n');
      } catch (e) {
      }
    }, 15000);

    const onMessage = async (ch: string, message: string) => {

      let out = message;
      try {

        JSON.parse(message);
      } catch (parseErr) {

        try {
          out = JSON.stringify({ raw: String(message) });
        } catch (e) {
          out = JSON.stringify({ raw: String(message) });
        }
      }


      try {
        res.write(`data: ${out}\n\n`);
      } catch (writeErr) {

        this.researchService['logger']?.warn?.('Failed to write SSE message to client (write error)');
      }


      try {
        const parsed = JSON.parse(out);
        const ev = parsed?.event ?? (parsed?.payload && parsed.payload.event) ?? null;

        if (parsed?.event === 'end_of_stream' || parsed?.event === 'complete' || parsed?.event === 'finished' || parsed?.event === 'error') {

          try { await this.redisService.unsubscribe(channel, onMessage); } catch (e) { /* ignore */ }
          clearInterval(heartbeatInterval);
          try { res.end(); } catch (e) { /* ignore */ }
        }
      } catch (err) {

      }
    };

    try {
      await this.redisService.subscribe(channel, onMessage);
    } catch (err) {

      const errObj = JSON.stringify({ event: 'error', payload: { message: 'Failed to subscribe to event channel' } });
      try { res.write(`data: ${errObj}\n\n`); } catch (e) { }
      clearInterval(heartbeatInterval);
      try { res.end(); } catch (e) { }
      return;
    }


    try {
      const raw = await this.redisService.getKey(checkpointKey);
      const state = raw ? JSON.parse(raw) : { exists: false };
      const initialEvent = JSON.stringify({ event: 'checkpoint', payload: state });
      res.write(`data: ${initialEvent}\n\n`);
    } catch (err) {

      this.researchService['logger']?.debug?.('Failed to read checkpoint', err);
    }

    this.researchService.startStreamAndPublish({
      user_id,
      thread_id,
      question,
    }).catch(e => {
      const errorEvent = JSON.stringify({ event: 'error', payload: { message: String(e) } });
      try { res.write(`data: ${errorEvent}\n\n`); } catch (e) { }
    });


    req.on('close', async () => {
      clearInterval(heartbeatInterval);
      try {
        await this.redisService.unsubscribe(channel, onMessage);
      } catch (err) {

      }
      try { res.end(); } catch (e) { }
    });
    return;
  }

  @Public()
  @Get('checkpoint')
  async getCheckpoint(@Query('user_id') user_id: string, @Query('thread_id') thread_id: string) {
    return this.researchService.getCheckpoint(user_id, thread_id);
  }
}
