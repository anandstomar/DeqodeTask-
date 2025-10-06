import { Controller, Post, Param, Body } from '@nestjs/common';
import { ThreadsService } from '../threads/threads.service';
import { MessageDto } from './message.dto';

@Controller('threads/:user_id/:thread_id/messages')
export class MessagesController {
  constructor(private readonly threads: ThreadsService) {}

  @Post()
  async add(@Param('user_id') user_id: string, @Param('thread_id') thread_id: string, @Body() body: MessageDto) {
    const msg = { id: Date.now().toString(), ...body, createdAt: new Date().toISOString() };
    return this.threads.appendMessage(user_id, thread_id, msg);
  }
}
