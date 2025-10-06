import { Controller, Post, Get, Body, Param, BadRequestException, Req, Delete, ForbiddenException } from '@nestjs/common';
import { ThreadsService } from './threads.service';
import { ThreadDto } from '../common/dto/thread.dto';
import { Public } from '../common/decorator/public.decorator';

@Controller('threads/')
export class ThreadsController {
  constructor(private readonly svc: ThreadsService) {}

  @Post()
  async create(@Body() body: Partial<ThreadDto>, @Req() req: any) {
    const jwtUserId = req.user?.sub ?? req.user?.id;
    if (!jwtUserId) {
      throw new BadRequestException('Authenticated user id not found in token');
    }
    const titleFallback = (body as any)?.title;

    const payload = {
      user_id: jwtUserId,
      thread_id: body.thread_id,
      question: body.question ?? titleFallback ?? null
    };

    return this.svc.createThread(payload);
  }

  @Public()
  @Get('user/:user_id')
  async listByUser(@Param('user_id') user_id: string) {
    return this.svc.getAllThreads(user_id);
  }

  @Public()
  @Get(':user_id/:thread_id')
  async get(@Param('user_id') user_id: string, @Param('thread_id') thread_id: string) {
    return this.svc.getThread(user_id, thread_id);
  }

  @Public()
  @Get(':user_id/:thread_id/messages')
  async getMessages(@Param('user_id') user_id: string, @Param('thread_id') thread_id: string) {
    return this.svc.getMessages(user_id, thread_id);
  }

  @Delete(':user_id/:thread_id')
  async delete(@Param('user_id') user_id: string, @Param('thread_id') thread_id: string, @Req() req: any) {
    const jwtUserId = req.user?.sub ?? req.user?.id;
    if (!jwtUserId) {
      throw new BadRequestException('Authenticated user id not found in token');
    }
    if (jwtUserId !== user_id) {
      throw new ForbiddenException('You are not allowed to delete threads for another user');
    }

    return this.svc.deleteThread(user_id, thread_id);
  }
}



