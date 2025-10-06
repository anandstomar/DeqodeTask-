import { Module } from '@nestjs/common';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { RedisService } from '../common/redis/redis.service';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { DatabaseModule } from 'src/database/database.module';
import { AuthModule } from 'src/auth/auth.module'; 

@Module({
  imports: [ConfigModule, HttpModule, DatabaseModule,AuthModule],
  controllers: [ResearchController],
  providers: [ResearchService, RedisService,JwtAuthGuard],
})
export class ResearchModule {}
