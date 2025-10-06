
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { RedisService } from '../common/redis/redis.service';
import { Request, Response } from 'express';

describe('ResearchController', () => {
    let controller: ResearchController;
    let mockResearchService: Partial<ResearchService>;
    let mockRedisService: Partial<RedisService>;
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;

    beforeEach(() => {
        mockResearchService = {
            startStreamAndPublish: jest.fn(),
            getCheckpoint: jest.fn(),
            logger: { warn: jest.fn(), debug: jest.fn() },
        } as any;

        mockRedisService = {
            subscribe: jest.fn(),
            unsubscribe: jest.fn(),
            getKey: jest.fn(),
        };

        controller = new ResearchController(mockResearchService as ResearchService, mockRedisService as RedisService);

        mockReq = { on: jest.fn() } as any;
        mockRes = {
            setHeader: jest.fn(),
            write: jest.fn(),
            end: jest.fn(),
            flushHeaders: jest.fn(),
        } as any;
    });

    describe('runBlocking', () => {
        it('calls startStreamAndPublish and returns status ok and id', async () => {
            const body = { user_id: 'u1', thread_id: 't1', question: 'q?' } as any;
            (mockResearchService.startStreamAndPublish as jest.Mock).mockResolvedValue(true);

            const res = await controller.runBlocking(body);
            expect(mockResearchService.startStreamAndPublish).toHaveBeenCalledWith({
                user_id: 'u1',
                thread_id: 't1',
                question: 'q?',
            });
            expect(res).toEqual({ status: 'ok', id: 'u1:t1' });
        });
    });

    describe('getCheckpoint', () => {
        it('calls researchService.getCheckpoint', async () => {
            (mockResearchService.getCheckpoint as jest.Mock).mockResolvedValue({ exists: true });
            const res = await controller.getCheckpoint('user1', 'thread1');
            expect(mockResearchService.getCheckpoint).toHaveBeenCalledWith('user1', 'thread1');
            expect(res).toEqual({ exists: true });
        });
    });

    describe('stream', () => {
        it('sets headers, subscribes to redis, writes checkpoint and handles messages', async () => {
            const user_id = 'u1';
            const thread_id = 't1';
            const question = 'hello';
            const channel = `financeResearch:${user_id}:${thread_id}:events`;
            const checkpointKey = `financeResearch:${user_id}:${thread_id}`;

            const messageCallback = jest.fn();


            (mockRedisService.getKey as jest.Mock).mockResolvedValue(JSON.stringify({ last: 42 }));
            (mockRedisService.subscribe as jest.Mock).mockImplementation(async (_ch, cb) => {
                messageCallback.mockImplementation(cb);
            });
            (mockResearchService.startStreamAndPublish as jest.Mock).mockResolvedValue(true);

            await controller.stream(user_id, thread_id, question, mockReq as Request, mockRes as Response);


            expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', expect.stringContaining('text/event-stream'));
            expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-transform');
            expect(mockRes.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
            expect(mockRes.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');


            expect(mockRedisService.subscribe).toHaveBeenCalledWith(channel, expect.any(Function));


            expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('"event":"checkpoint"'));


            expect(mockResearchService.startStreamAndPublish).toHaveBeenCalledWith({ user_id, thread_id, question });
        });

        it('handles subscription error by sending error event and ending response', async () => {
            const user_id = 'u1';
            const thread_id = 't1';
            const question = 'q';
            (mockRedisService.subscribe as jest.Mock).mockRejectedValue(new Error('fail'));

            await controller.stream(user_id, thread_id, question, mockReq as Request, mockRes as Response);

            expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('"event":"error"'));
            expect(mockRes.end).toHaveBeenCalled();
        });
    });
});
