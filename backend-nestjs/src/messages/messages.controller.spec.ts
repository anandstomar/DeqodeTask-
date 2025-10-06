import { MessagesController } from './messages.controller';
import { ThreadsService } from '../threads/threads.service';
import { MessageDto } from './message.dto';

describe('MessagesController', () => {
  let controller: MessagesController;
  let mockThreadsService: Partial<ThreadsService>;

  beforeEach(() => {
    mockThreadsService = {
      appendMessage: jest.fn(),
    };

    controller = new MessagesController(mockThreadsService as ThreadsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('add', () => {
    it('should call ThreadsService.appendMessage with correct parameters', async () => {
      const user_id = 'user123';
      const thread_id = 'thread456';
      const body: MessageDto = { text: 'Hello world', sender: 'user123' } as any;

      const fakeMsg = {
        id: expect.any(String),
        ...body,
        createdAt: expect.any(String),
      };

      (mockThreadsService.appendMessage as jest.Mock).mockResolvedValue(fakeMsg);

      const result = await controller.add(user_id, thread_id, body);

      expect(mockThreadsService.appendMessage).toHaveBeenCalledWith(user_id, thread_id, expect.objectContaining(fakeMsg));
      expect(result).toEqual(fakeMsg);
    });

    it('should generate a message id and createdAt timestamp', async () => {
      const user_id = 'user1';
      const thread_id = 'thread1';
      const body = { text: 'Test', sender: 'user1' } as unknown as MessageDto;

      (mockThreadsService.appendMessage as jest.Mock).mockResolvedValue({});

      await controller.add(user_id, thread_id, body);

      const callArgs = (mockThreadsService.appendMessage as jest.Mock).mock.calls[0][2];
      expect(callArgs.id).toMatch(/\\d+/);
      expect(new Date(callArgs.createdAt).toString()).not.toBe('Invalid Date');
    });
  });
});
