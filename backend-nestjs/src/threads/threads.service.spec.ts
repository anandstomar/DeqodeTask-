// threads.service.spec.ts
import { ThreadsService } from './threads.service';
import { RedisService } from '../common/redis/redis.service';
import { PrismaService } from '../database/prisma.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('ThreadsService', () => {
  let service: ThreadsService;
  let redis: Partial<RedisService>;
  let prisma: any;
  beforeEach(() => {
    redis = {
      setKey: jest.fn(),
      getKey: jest.fn(),
      publish: jest.fn(),
    };
    prisma = {
      user: { findUnique: jest.fn() },
      thread: { findUnique: jest.fn(), upsert: jest.fn(), findMany: jest.fn() }, // added findMany
      message: { findMany: jest.fn(), create: jest.fn() },
      $transaction: jest.fn(),
    };

    service = new ThreadsService(redis as RedisService, prisma as PrismaService);
  });

  describe('createThread', () => {
    it('throws if user_id or thread_id missing', async () => {
      await expect(service.createThread({ user_id: '', thread_id: '' })).rejects.toThrow(BadRequestException);
    });

    it('throws if user not found in DB', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.createThread({ user_id: 'u1', thread_id: 't1', question: 'q?' }))
        .rejects.toThrow(BadRequestException);
    });

    it('creates thread in Redis and DB', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u1' });
      (prisma.thread.upsert as jest.Mock).mockResolvedValue({ id: 't1', userId: 'u1', question: 'q?' });
      const res = await service.createThread({ user_id: 'u1', thread_id: 't1', question: 'q?' });
      expect(res.redis).toBeDefined();
      expect(res.db).toEqual({ id: 't1', userId: 'u1', question: 'q?' });
      expect(redis.setKey).toHaveBeenCalled();
    });
  });

  describe('getAllThreads', () => {
    it('throws if user_id missing', async () => {
      await expect(service.getAllThreads('')).rejects.toThrow(BadRequestException);
    });

    it('throws if user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.getAllThreads('u1')).rejects.toThrow(BadRequestException);
    });

    it('returns mapped threads', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u1' });
      (prisma.thread.findMany as jest.Mock).mockResolvedValue([
        { id: 't1', userId: 'u1', title: 'title', question: 'q', createdAt: 'c', updatedAt: 'u', messages: [] }
      ]);
      const res = await service.getAllThreads('u1');
      expect(res[0].id).toBe('t1');
    });
  });

  describe('getThread', () => {
    it('merges Redis and DB messages', async () => {
      (prisma.thread.findUnique as jest.Mock).mockResolvedValue({
        id: 't1', userId: 'u1', title: 'title', question: 'q', createdAt: 'c', updatedAt: 'u', messages: []
      });
      (redis.getKey as jest.Mock).mockResolvedValue(JSON.stringify({ messages: [{ id: 'm1', author: 'a', content: 'hi', createdAt: 'd' }] }));
      const thread = await service.getThread('u1', 't1');
      expect(thread.messages.length).toBe(1);
      expect(thread.messages[0].id).toBe('m1');
    });
  });

  describe('appendMessage', () => {
    it('appends message to Redis and DB', async () => {
      (redis.getKey as jest.Mock).mockResolvedValue(JSON.stringify({ messages: [] }));
      (redis.setKey as jest.Mock).mockResolvedValue(undefined);
      (prisma.$transaction as jest.Mock).mockImplementation(async fn => fn(prisma));
      prisma.thread.findUnique = jest.fn().mockResolvedValue({ id: 't1', userId: 'u1' });
      prisma.message.create = jest.fn().mockResolvedValue({ id: 'm1', author: 'a', content: 'hi' });

      const res = await service.appendMessage('u1', 't1', { author: 'a', content: 'hi' });
      expect(res.redis.messages.length).toBe(1);
      expect(res.db.id).toBe('m1');
    });
  });

  describe('deleteThread', () => {
    it('throws if thread not found', async () => {
      (prisma.thread.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.deleteThread('u1', 't1')).rejects.toThrow(BadRequestException);
    });

    it('throws if userId mismatch', async () => {
      (prisma.thread.findUnique as jest.Mock).mockResolvedValue({ id: 't1', userId: 'u2' });
      await expect(service.deleteThread('u1', 't1')).rejects.toThrow(ForbiddenException);
    });

    it('deletes thread and messages', async () => {
      (prisma.thread.findUnique as jest.Mock).mockResolvedValue({ id: 't1', userId: 'u1' });
      (prisma.$transaction as jest.Mock).mockResolvedValue(undefined);
      (redis.publish as jest.Mock).mockResolvedValue(1);

      const res = await service.deleteThread('u1', 't1');
      expect(res).toEqual({ ok: true });
    });
  });
});
