import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { RedisService } from './redis.service';

jest.mock('ioredis');

type MockRedis = {
  on: jest.Mock;
  publish: jest.Mock;
  subscribe: jest.Mock;
  unsubscribe: jest.Mock;
  set: jest.Mock;
  get: jest.Mock;
  quit: jest.Mock;
};

function createMockRedis(): MockRedis & { listeners: Record<string, (...args: any[]) => void> } {
  const listeners: Record<string, (...args: any[]) => void> = {};
  const mock: any = {
    listeners,
    on: jest.fn((ev: string, cb: (...args: any[]) => void) => {
      listeners[ev] = cb;
    }),
    publish: jest.fn(async (channel: string, message: string) => 1),
    subscribe: jest.fn(async (channel: string) => 'OK'),
    unsubscribe: jest.fn(async (channel: string) => 'OK'),
    set: jest.fn(async (k: string, v: string) => 'OK'),
    get: jest.fn(async (k: string) => null),
    quit: jest.fn(async () => 'OK'),
  };
  return mock;
}

describe('RedisService', () => {
  let createdInstances: Array<ReturnType<typeof createMockRedis>> = [];
  let MockIORedisCtor: jest.Mock;

  beforeEach(() => {
    createdInstances = [];
    // Provide a fresh mock implementation that returns a fresh mock object per construction.
    MockIORedisCtor = (IORedis as unknown as jest.Mock).mockImplementation(() => {
      const inst = createMockRedis();
      createdInstances.push(inst);
      return inst;
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('getClient/getSubscriber throw before onModuleInit', () => {
    const cfg = { get: jest.fn() } as unknown as ConfigService;
    const svc = new RedisService(cfg);
    expect(() => svc.getClient()).toThrow('Redis client not initialized');
    expect(() => svc.getSubscriber()).toThrow('Redis subscriber not initialized');
  });

  it('onModuleInit creates client and subscriber and wires message event', async () => {
    const cfg = { get: jest.fn().mockReturnValue('redis://example:6379') } as unknown as ConfigService;
    const svc = new RedisService(cfg);
    svc.onModuleInit();

    // Two instances created: client and subscriber
    expect(MockIORedisCtor).toHaveBeenCalledTimes(2);
    const client = svc.getClient();
    const sub = svc.getSubscriber();
    expect(client).toBeDefined();
    expect(sub).toBeDefined();

    // subscriber.on should be wired for 'message'
    const subInst = createdInstances[1];
    expect(subInst.on).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('publish delegates to client.publish and returns its value', async () => {
    const cfg = { get: jest.fn() } as unknown as ConfigService;
    const svc = new RedisService(cfg);
    svc.onModuleInit();

    const clientInst = createdInstances[0];
    clientInst.publish.mockResolvedValue(3);

    const res = await svc.publish('ch', 'm');
    expect(clientInst.publish).toHaveBeenCalledWith('ch', 'm');
    expect(res).toBe(3);
  });

  it('setKey and getKey delegate correctly', async () => {
    const cfg = { get: jest.fn() } as unknown as ConfigService;
    const svc = new RedisService(cfg);
    svc.onModuleInit();

    const clientInst = createdInstances[0];
    clientInst.set.mockResolvedValue('OK');
    clientInst.get.mockResolvedValue('val');

    await svc.setKey('k', 'v');
    expect(clientInst.set).toHaveBeenCalledWith('k', 'v');

    const val = await svc.getKey('k');
    expect(clientInst.get).toHaveBeenCalledWith('k');
    expect(val).toBe('val');
  });

  it('subscribe registers listener and underlying subscribe is called once per channel', async () => {
    const cfg = { get: jest.fn() } as unknown as ConfigService;
    const svc = new RedisService(cfg);
    svc.onModuleInit();

    const subInst = createdInstances[1];

    const listenerA = jest.fn();
    const listenerB = jest.fn();

    await svc.subscribe('chan1', listenerA);
    expect(subInst.subscribe).toHaveBeenCalledWith('chan1');

    // subscribe again with different listener -> should not call underlying subscribe again
    await svc.subscribe('chan1', listenerB);
    expect(subInst.subscribe).toHaveBeenCalledTimes(1);

    // duplicate registration of same listener should not increase set
    await svc.subscribe('chan1', listenerA);
    expect(subInst.subscribe).toHaveBeenCalledTimes(1);
  });

  it('subscriber message dispatch invokes registered listeners', async () => {
    const cfg = { get: jest.fn() } as unknown as ConfigService;
    const svc = new RedisService(cfg);
    svc.onModuleInit();

    const subInst = createdInstances[1];

    const listenerA = jest.fn();
    const listenerB = jest.fn();

    await svc.subscribe('events', listenerA);
    await svc.subscribe('events', listenerB);

    // simulate incoming message by calling stored callback
    const messageCb = subInst.listeners['message'];
    expect(typeof messageCb).toBe('function');

    messageCb('events', 'hello');

    expect(listenerA).toHaveBeenCalledWith('events', 'hello');
    expect(listenerB).toHaveBeenCalledWith('events', 'hello');
  });

  it('unsubscribe removes a specific listener and unsubscribes underlying when no listeners remain', async () => {
    const cfg = { get: jest.fn() } as unknown as ConfigService;
    const svc = new RedisService(cfg);
    svc.onModuleInit();

    const subInst = createdInstances[1];

    const l1 = jest.fn();
    const l2 = jest.fn();

    await svc.subscribe('c1', l1);
    await svc.subscribe('c1', l2);
    // remove one listener
    await svc.unsubscribe('c1', l1);
    // underlying unsubscribe not called because one listener remains
    expect(subInst.unsubscribe).not.toHaveBeenCalled();

    // remove last listener
    await svc.unsubscribe('c1', l2);
    // underlying unsubscribe should have been called once
    expect(subInst.unsubscribe).toHaveBeenCalledWith('c1');
  });

  it('unsubscribe without listener clears all and unsubscribes', async () => {
    const cfg = { get: jest.fn() } as unknown as ConfigService;
    const svc = new RedisService(cfg);
    svc.onModuleInit();

    const subInst = createdInstances[1];

    const l1 = jest.fn();
    const l2 = jest.fn();

    await svc.subscribe('chanX', l1);
    await svc.subscribe('chanX', l2);

    // clear all
    await svc.unsubscribe('chanX');
    expect(subInst.unsubscribe).toHaveBeenCalledWith('chanX');
  });

  it('onModuleDestroy unsubscribes from channels and quits clients', async () => {
    const cfg = { get: jest.fn() } as unknown as ConfigService;
    const svc = new RedisService(cfg);
    svc.onModuleInit();

    const subInst = createdInstances[1];
    const clientInst = createdInstances[0];

    // subscribe some channels
    const l = jest.fn();
    await svc.subscribe('x', l);
    await svc.unsubscribe('x'); // leaves no subscriptions

    // add another channel and do not unsubscribe to test the destroy loop
    const listener = jest.fn();
    await svc.subscribe('y', listener);

    // Now call onModuleDestroy - should attempt to unsubscribe from each channel and quit both clients
    await svc.onModuleDestroy();

    // quit called on both client and subscriber
    expect(clientInst.quit).toHaveBeenCalled();
    expect(subInst.quit).toHaveBeenCalled();
  });

  it('errors from underlying ioredis methods are thrown or logged (publish/set/get)', async () => {
    const cfg = { get: jest.fn() } as unknown as ConfigService;
    const svc = new RedisService(cfg);
    svc.onModuleInit();

    const clientInst = createdInstances[0];
    clientInst.publish.mockRejectedValue(new Error('pub-fail'));
    await expect(svc.publish('a', 'b')).rejects.toThrow('pub-fail');

    clientInst.set.mockRejectedValue(new Error('set-fail'));
    await expect(svc.setKey('k', 'v')).rejects.toThrow('set-fail');

    clientInst.get.mockRejectedValue(new Error('get-fail'));
    await expect(svc.getKey('k')).rejects.toThrow('get-fail');
  });
});
