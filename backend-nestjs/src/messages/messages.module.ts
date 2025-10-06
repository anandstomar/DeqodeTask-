import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { ThreadsService } from '../threads/threads.service';
import { RedisService } from '../common/redis/redis.service';
import { ThreadsModule } from 'src/threads/threads.module';

@Module({
  controllers: [MessagesController],
  imports: [ThreadsModule],
})
export class MessagesModule {}
