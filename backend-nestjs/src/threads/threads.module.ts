import { Module } from '@nestjs/common';
import { ThreadsController } from './threads.controller';
import { ThreadsService } from './threads.service';
import { DatabaseModule } from 'src/database/database.module';
import { RedisModule } from 'src/common/redis/redis.module';

@Module({
  imports: [
    RedisModule,     
    DatabaseModule,  
  ],
  controllers: [ThreadsController],
  providers: [ThreadsService ],
  exports: [ThreadsService]
})
export class ThreadsModule {}
