
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import IORedis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: IORedis | null = null;
  private subscriber: IORedis | null = null;
  private listeners = new Map<string, Set<(channel: string, message: string) => void>>();
  private readonly logger = new Logger(RedisService.name);

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.logger.log(`Connecting to Redis at ${url}`);

    this.client = new IORedis(url);
    this.subscriber = new IORedis(url);

    this.subscriber.on('message', (channel: string, message: string) => {
      const set = this.listeners.get(channel);
      if (!set) return;
      for (const fn of Array.from(set)) {
        try {
          fn(channel, message);
        } catch (e) {
          this.logger.warn(`Listener threw for channel=${channel}: ${(e as Error).message ?? e}`);
        }
      }
    });

    this.client.on('error', (e) => this.logger.error('Redis client error', e));
    this.subscriber.on('error', (e) => this.logger.error('Redis subscriber error', e));
  }

  getClient(): IORedis {
    if (!this.client) throw new Error('Redis client not initialized');
    return this.client;
  }

  getSubscriber(): IORedis {
    if (!this.subscriber) throw new Error('Redis subscriber not initialized');
    return this.subscriber;
  }

  async publish(channel: string, message: string): Promise<number> {
    if (!this.client) throw new Error('Redis client not initialized');
    try {
      return await this.client.publish(channel, message);
    } catch (err) {
      this.logger.error(`Failed to publish to ${channel}`, (err as Error).stack ?? String(err));
      throw err;
    }
  }

  async subscribe(channel: string, listener: (channel: string, message: string) => void): Promise<void> {
    if (!this.subscriber) throw new Error('Redis subscriber not initialized');
    try {
      if (!this.listeners.has(channel)) {
        this.listeners.set(channel, new Set());
        await this.subscriber.subscribe(channel);
        this.logger.debug(`Subscribed underlying Redis subscriber to channel: ${channel}`);
      }
      const set = this.listeners.get(channel)!;
      if (!set.has(listener)) {
        set.add(listener);
        this.logger.debug(`Added listener for channel ${channel} (total listeners: ${set.size})`);
      } else {
        this.logger.debug(`Listener already registered for channel ${channel}`);
      }
    } catch (err) {
      this.logger.error(`Failed to subscribe to channel ${channel}`, (err as Error).stack ?? String(err));
      throw err;
    }
  }

  async unsubscribe(channel: string, listener?: (channel: string, message: string) => void): Promise<void> {
    if (!this.subscriber) throw new Error('Redis subscriber not initialized');
    try {
      const set = this.listeners.get(channel);
      if (!set) return;

      if (listener) {
        if (set.delete(listener)) {
          this.logger.debug(`Removed one listener for channel ${channel} (remaining: ${set.size})`);
        } else {
          this.logger.warn(`Attempted to remove listener that was not registered for channel ${channel}`);
        }
      } else {
        set.clear();
        this.logger.debug(`Cleared all listeners for channel ${channel}`);
      }

      if (set.size === 0) {
        try {
          await this.subscriber.unsubscribe(channel);
          this.logger.debug(`Unsubscribed underlying Redis subscriber from channel: ${channel}`);
        } catch (e) {
          this.logger.warn(`Error unsubscribing underlying Redis from ${channel}: ${String(e)}`);
        }
        this.listeners.delete(channel);
      }
    } catch (err) {
      this.logger.error(`Failed to unsubscribe from channel ${channel}`, (err as Error).stack ?? String(err));
      throw err;
    }
  }


  async setKey(key: string, value: string): Promise<void> {
    if (!this.client) throw new Error('Redis client not initialized');
    try {
      await this.client.set(key, value);
    } catch (err) {
      this.logger.error(`Failed to set key ${key}`, (err as Error).stack ?? String(err));
      throw err;
    }
  }

  async getKey(key: string): Promise<string | null> {
    if (!this.client) throw new Error('Redis client not initialized');
    try {
      return await this.client.get(key);
    } catch (err) {
      this.logger.error(`Failed to get key ${key}`, (err as Error).stack ?? String(err));
      throw err;
    }
  }

  async onModuleDestroy() {
    try {
      for (const [channel] of Array.from(this.listeners.entries())) {
        try {
          if (this.subscriber) await this.subscriber.unsubscribe(channel);
        } catch (e) {
        }
      }
    } catch (e) {}

    this.listeners.clear();

    try {
      if (this.client) await this.client.quit();
    } catch (e) {

    }
    try {
      if (this.subscriber) await this.subscriber.quit();
    } catch (e) {
    }
    this.logger.log('Redis connections closed and listeners cleared');
  }
}

