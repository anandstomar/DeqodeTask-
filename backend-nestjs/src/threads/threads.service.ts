import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ThreadsService {
  private ns = process.env.CHECKPOINT_NS || 'financeResearch';
  private readonly logger = new Logger(ThreadsService.name);
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService
  ) { }

  private key(userId: string, threadId: string) {
    return `${this.ns}:${userId}:${threadId}`;
  }


  async createThread({ user_id, thread_id, question }: { user_id: string; thread_id: string; question?: string }) {
    if (!user_id || !thread_id) {
      throw new BadRequestException('user_id and thread_id are required');
    }


    const initial = {
      question: question ?? null,
      createdAt: new Date().toISOString(),
      messages: []
    };


    try {
      await this.redis.setKey(this.key(user_id, thread_id), JSON.stringify(initial));
    } catch (err) {
      this.logger.error('Failed to write initial checkpoint to Redis', err instanceof Error ? err.stack : String(err));

      throw new BadRequestException('Failed to write checkpoint to Redis');
    }


    const user = await this.prisma.user.findUnique({ where: { id: user_id } });
    if (!user) {


      this.logger.warn(`createThread attempted with non-existing user: ${user_id}`);
      throw new BadRequestException(`User with id '${user_id}' not found. Create the user (signup) before creating a thread.`);
    }


    try {
      const dbThread = await this.prisma.thread.upsert({
        where: { id: thread_id },
        create: {
          id: thread_id,
          userId: user_id,
          question: question ?? null,
          title: question ? (question.length > 60 ? question.slice(0, 57) + '...' : question) : null
        },
        update: {
          question: question ?? undefined,
          title: question ? (question.length > 60 ? question.slice(0, 57) + '...' : question) : undefined,
        },
      });

      return { redis: initial, db: dbThread };
    } catch (err) {


      this.logger.error('Error creating/updating thread in DB', err instanceof Error ? err.stack : String(err));

      return {
        redis: initial,
        dbError: err instanceof Error ? err.message : String(err)
      };
    }
  }

  async getAllThreads(user_id: string) {
    if (!user_id) throw new BadRequestException('user_id is required');


    const user = await this.prisma.user.findUnique({ where: { id: user_id } });
    if (!user) {
      this.logger.warn(`getAllThreads called for non-existing user ${user_id}`);
      throw new BadRequestException(`User '${user_id}' not found`);
    }


    const threads = await this.prisma.thread.findMany({
      where: { userId: user_id },
      orderBy: { updatedAt: 'desc' },
      include: {

        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });


    const result = threads.map(t => ({
      id: t.id,
      userId: t.userId,
      title: t.title,
      question: t.question,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      lastMessage: (t.messages && t.messages.length > 0) ? {
        id: t.messages[0].id,
        author: t.messages[0].author,
        content: t.messages[0].content,
        createdAt: t.messages[0].createdAt
      } : null
    }));

    return result;
  }

  async getThread(user_id: string, thread_id: string) {

    const dbThread = await this.prisma.thread.findUnique({
      where: { id: thread_id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });


    let checkpointState: any = null;
    try {
      const raw = await this.redis.getKey(this.key(user_id, thread_id));
      if (raw) checkpointState = JSON.parse(raw);
    } catch (err) {
      this.logger.warn('Failed to read checkpoint from Redis', err instanceof Error ? err.message : String(err));
    }


    const messagesFromRedis = checkpointState?.messages ?? [];
    const dbMessages = (dbThread?.messages ?? []).map(m => ({
      id: m.id,
      author: m.author,
      content: m.content,
      createdAt: m.createdAt
    }));


    const mergedMessages = messagesFromRedis.length > 0 ? messagesFromRedis : dbMessages;

    const threadResource = {
      id: dbThread?.id ?? thread_id,
      userId: dbThread?.userId ?? user_id,
      title: dbThread?.title ?? checkpointState?.title ?? null,
      createdAt: dbThread?.createdAt ?? checkpointState?.createdAt ?? null,
      updatedAt: dbThread?.updatedAt ?? checkpointState?.updatedAt ?? null,
      question: checkpointState?.question ?? dbThread?.question ?? null,
      messages: mergedMessages,
      latestCheckpoint: {
        hasReport: !!(checkpointState?.report),
        draftPreview: (checkpointState?.draft || '').slice(0, 200),
        lastUpdated: checkpointState?.updatedAt ?? null
      }
    };

    return threadResource;
  }


  async getMessages(user_id: string, thread_id: string) {

    try {
      const raw = await this.redis.getKey(this.key(user_id, thread_id));
      if (raw) {
        const state = JSON.parse(raw);
        if (Array.isArray(state.messages) && state.messages.length > 0) {
          return state.messages;
        }
      }
    } catch (err) {
      this.logger.warn('Redis read for messages failed', err instanceof Error ? err.message : String(err));

    }


    try {
      const dbMessages = await this.prisma.message.findMany({
        where: { threadId: thread_id },
        orderBy: { createdAt: 'asc' }
      });
      return dbMessages;
    } catch (err) {
      this.logger.error('Failed to read messages from DB', err instanceof Error ? err.stack : String(err));
      throw new BadRequestException('Failed to load messages');
    }
  }




  async appendMessage(
    user_id: string,
    thread_id: string,
    message: { id?: string; author: string; content: string }
  ) {
    const ckKey = this.key(user_id, thread_id);


    let state: { question?: any; messages: any[]; draft?: string | null; report?: string | null; updatedAt?: string } = {
      question: null,
      messages: []
    };


    try {
      const raw = await this.redis.getKey(ckKey);
      if (raw) state = JSON.parse(raw);
    } catch (err) {
      this.logger.warn('Failed to read checkpoint for append', err instanceof Error ? err.message : String(err));
    }


    state.messages = state.messages || [];


    const msg = {
      id: message.id ?? Date.now().toString(),
      author: message.author,
      content: message.content,
      createdAt: new Date().toISOString()
    };


    state.messages.push(msg);
    state.updatedAt = new Date().toISOString();


    try {
      if (String(msg.author).toLowerCase() === 'assistant' || String(msg.author).toLowerCase() === 'system') {
        state.report = msg.content;
        state.draft = (msg.content || '').slice(0, 1000);
      }
    } catch (err) {

      this.logger.warn('Failed to set checkpoint report/draft', err instanceof Error ? err.message : String(err));
    }


    try {
      await this.redis.setKey(ckKey, JSON.stringify(state));
    } catch (err) {
      this.logger.error('Failed to write checkpoint to Redis during append', err instanceof Error ? err.stack : String(err));

    }


    try {

      const result = await this.prisma.$transaction(async (tx) => {

        let thread = await tx.thread.findUnique({ where: { id: thread_id } });

        if (!thread) {
          const user = await tx.user.findUnique({ where: { id: user_id } });
          if (!user) {

            throw new BadRequestException(`User '${user_id}' not found`);
          }

          thread = await tx.thread.create({
            data: {
              id: thread_id,
              userId: user_id,
              question: state.question ?? null,

              title: state.question ? (state.question.length > 60 ? state.question.slice(0, 57) + '...' : state.question) : null
            }
          });
        }


        const dbMessage = await tx.message.create({
          data: {
            id: msg.id,
            threadId: thread_id,
            author: msg.author,
            content: msg.content
          }
        });

        return { threadCreated: !thread, dbMessage };
      });

      return { redis: state, db: result.dbMessage };
    } catch (err) {

      this.logger.error('Failed to append message to DB', err instanceof Error ? err.stack : String(err));
      return { redis: state, dbError: err instanceof Error ? err.message : String(err) };
    }
  }

  async deleteThread(user_id: string, thread_id: string) {
    if (!user_id || !thread_id) {
      throw new BadRequestException('user_id and thread_id are required');
    }


    const thread = await this.prisma.thread.findUnique({ where: { id: thread_id } });
    if (!thread) {

      throw new BadRequestException(`Thread '${thread_id}' not found`);
    }


    if (thread.userId !== user_id) {
      throw new ForbiddenException('You may only delete your own threads');
    }

    try {

      await this.prisma.$transaction([
        this.prisma.message.deleteMany({ where: { threadId: thread_id } }),
        this.prisma.thread.delete({ where: { id: thread_id } })
      ]);


      const ckKey = this.key(user_id, thread_id);
      try {

        if (typeof (this.redis as any).deleteKey === 'function') {
          await (this.redis as any).deleteKey(ckKey);
        } else if (typeof (this.redis as any).delKey === 'function') {
          await (this.redis as any).delKey(ckKey);
        } else if (typeof (this.redis as any).del === 'function') {
          await (this.redis as any).del(ckKey);
        } else {

          try { await this.redis.setKey(ckKey, JSON.stringify({})); } catch { }
        }


        const eventsChannel = `${this.ns}:${user_id}:${thread_id}:events`;
        try {

          await this.redis.publish(eventsChannel, JSON.stringify({ event: 'thread_deleted', payload: { thread_id } }));
        } catch (e) {

        }
      } catch (e) {
        this.logger.warn('Failed to clean Redis for deleted thread', e as any);
      }

      return { ok: true };
    } catch (err) {
      this.logger.error('Failed to delete thread', err instanceof Error ? err.stack : String(err));
      throw new BadRequestException('Failed to delete thread: ' + (err instanceof Error ? err.message : String(err)));
    }

  }
}


