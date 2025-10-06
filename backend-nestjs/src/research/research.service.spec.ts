import { ResearchService } from './research.service';
import { RedisService } from '../common/redis/redis.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ResearchService', () => {
  let service: ResearchService;
  let redisService: Partial<RedisService>;
  let configService: Partial<ConfigService>;

  beforeEach(() => {
    redisService = {
      setKey: jest.fn(),
      getKey: jest.fn(),
      publish: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'PY_AGENT_BASE_URL') return 'http://localhost:8000';
        if (key === 'CHECKPOINT_NS') return 'testNs';
        return undefined;
      }),
    };

    service = new ResearchService(redisService as RedisService, configService as ConfigService);
  });

  describe('runBlocking', () => {
    it('posts to python agent and stores checkpoint', async () => {
      const req = { user_id: 'u1', thread_id: 't1', question: 'q' };
      const resultData = { result: { some: 'data' } };
      mockedAxios.post.mockResolvedValueOnce({ data: resultData });

      await service.runBlocking(req);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:8000/api/agent/run',
        req,
        { timeout: 120000 }
      );

      expect(redisService.setKey).toHaveBeenCalledWith(
        'testNs:u1:t1',
        JSON.stringify(resultData)
      );
    });

    it('handles failure to store checkpoint gracefully', async () => {
      const req = { user_id: 'u1', thread_id: 't1', question: 'q' };
      const resultData = { result: { some: 'data' } };
      mockedAxios.post.mockResolvedValueOnce({ data: resultData });
      (redisService.setKey as jest.Mock).mockRejectedValueOnce(new Error('fail'));

      await expect(service.runBlocking(req)).resolves.toEqual(resultData);
    });
  });

  describe('startStreamAndPublish', () => {
    it('publishes job and subscribes to channel', async () => {
      const req = { user_id: 'u1', thread_id: 't1', question: 'q' };
      (redisService.publish as jest.Mock).mockResolvedValue(1);
      (redisService.subscribe as jest.Mock).mockResolvedValue(undefined);

      const res = await service.startStreamAndPublish(req);

      expect(res.channel).toBe('testNs:u1:t1:events');
      expect(res.checkpoint_key).toBe('testNs:u1:t1');
      expect(redisService.publish).toHaveBeenCalledWith(
        'testNs:job_queue',
        expect.stringContaining('"user_id":"u1"')
      );
      expect(redisService.subscribe).toHaveBeenCalledWith(
        'testNs:u1:t1:events',
        expect.any(Function)
      );
    });

    it('prevents duplicate active runs', async () => {
      const req = { user_id: 'u1', thread_id: 't1', question: 'q' };
      (redisService.publish as jest.Mock).mockResolvedValue(1);
      (redisService.subscribe as jest.Mock).mockResolvedValue(undefined);

      await service.startStreamAndPublish(req);
      const second = await service.startStreamAndPublish(req);

      expect(second.channel).toBe('testNs:u1:t1:events');
      expect(redisService.publish).toHaveBeenCalledTimes(1); // second call did not publish
    });

    it('cleans up active run on publish failure', async () => {
      const req = { user_id: 'u1', thread_id: 't1', question: 'q' };
      (redisService.publish as jest.Mock).mockRejectedValueOnce(new Error('fail'));

      await expect(service.startStreamAndPublish(req)).rejects.toThrow('fail');
      expect((service as any).activeRuns.has('u1:t1')).toBe(false);
    });
  });

  describe('getCheckpoint', () => {
    it('returns parsed checkpoint', async () => {
      (redisService.getKey as jest.Mock).mockResolvedValue(JSON.stringify({ a: 1 }));
      const res = await service.getCheckpoint('u1', 't1');
      expect(res).toEqual({ a: 1 });
      expect(redisService.getKey).toHaveBeenCalledWith('testNs:u1:t1');
    });

    it('returns null if no key', async () => {
      (redisService.getKey as jest.Mock).mockResolvedValue(null);
      const res = await service.getCheckpoint('u1', 't1');
      expect(res).toBeNull();
    });
  });
});
