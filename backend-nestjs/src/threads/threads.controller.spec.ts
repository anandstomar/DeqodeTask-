import { ThreadsController } from './threads.controller';
import { ThreadsService } from './threads.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('ThreadsController', () => {
  let controller: ThreadsController;
  let threadsService: Partial<ThreadsService>;

  beforeEach(() => {
    threadsService = {
      createThread: jest.fn(),
      getAllThreads: jest.fn(),
      getThread: jest.fn(),
      getMessages: jest.fn(),
      deleteThread: jest.fn(),
    };

    controller = new ThreadsController(threadsService as ThreadsService);
  });

  describe('create', () => {
    it('creates thread with authenticated user', async () => {
      const req = { user: { sub: 'user1' } };
      const body = { thread_id: 't1', question: 'q?' };
      (threadsService.createThread as jest.Mock).mockResolvedValue({ ok: true });

      const res = await controller.create(body, req);
      expect(res).toEqual({ ok: true });
      expect(threadsService.createThread).toHaveBeenCalledWith({
        user_id: 'user1',
        thread_id: 't1',
        question: 'q?',
      });
    });

    it('throws BadRequestException if no user', async () => {
      const req = { user: null };
      await expect(controller.create({}, req)).rejects.toThrow(BadRequestException);
    });

    it('falls back to title if question missing', async () => {
      const req = { user: { sub: 'u1' } };
      const body = { thread_id: 't2', title: 'fallback title' };
      (threadsService.createThread as jest.Mock).mockResolvedValue(true);

      const res = await controller.create(body, req);
      expect(threadsService.createThread).toHaveBeenCalledWith({
        user_id: 'u1',
        thread_id: 't2',
        question: 'fallback title',
      });
      expect(res).toBe(true);
    });
  });

  describe('listByUser', () => {
    it('returns all threads for user', async () => {
      (threadsService.getAllThreads as jest.Mock).mockResolvedValue(['thread1']);
      const res = await controller.listByUser('u1');
      expect(res).toEqual(['thread1']);
      expect(threadsService.getAllThreads).toHaveBeenCalledWith('u1');
    });
  });

  describe('get', () => {
    it('returns a thread', async () => {
      (threadsService.getThread as jest.Mock).mockResolvedValue({ id: 't1' });
      const res = await controller.get('u1', 't1');
      expect(res).toEqual({ id: 't1' });
      expect(threadsService.getThread).toHaveBeenCalledWith('u1', 't1');
    });
  });

  describe('getMessages', () => {
    it('returns messages for a thread', async () => {
      (threadsService.getMessages as jest.Mock).mockResolvedValue(['msg1']);
      const res = await controller.getMessages('u1', 't1');
      expect(res).toEqual(['msg1']);
      expect(threadsService.getMessages).toHaveBeenCalledWith('u1', 't1');
    });
  });

  describe('delete', () => {
    it('deletes thread if user matches', async () => {
      const req = { user: { sub: 'u1' } };
      (threadsService.deleteThread as jest.Mock).mockResolvedValue(true);

      const res = await controller.delete('u1', 't1', req);
      expect(res).toBe(true);
      expect(threadsService.deleteThread).toHaveBeenCalledWith('u1', 't1');
    });

    it('throws BadRequestException if no user', async () => {
      const req = { user: null };
      await expect(controller.delete('u1', 't1', req)).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException if user mismatch', async () => {
      const req = { user: { sub: 'u2' } };
      await expect(controller.delete('u1', 't1', req)).rejects.toThrow(ForbiddenException);
    });
  });
});
