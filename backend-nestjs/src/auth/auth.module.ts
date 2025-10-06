import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { DatabaseModule } from '../database/database.module';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from 'src/database/prisma.service';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule, 
    JwtModule.registerAsync({
      imports: [ConfigModule, DatabaseModule,],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'change_this_secret',
        signOptions: {
          expiresIn: config.get<string | number>('JWT_EXPIRES_IN') || '3600s',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, PrismaService],
  exports: [AuthService, JwtModule, JwtAuthGuard],
})
export class AuthModule {}
