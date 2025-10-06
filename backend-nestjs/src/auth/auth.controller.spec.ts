import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import { AuthController } from './auth.controller';

let controller: AuthController;
let mockAuthService: any;
let mockPrisma: any;

describe('AuthController', () => {
  beforeEach(() => {
    mockAuthService = {
      register: jest.fn(),
      login: jest.fn(),
    };

    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
    };

    controller = new AuthController(mockAuthService as any, mockPrisma as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });


describe('register', () => {
    it('returns status ok and user', async () => {
        const user = { id: 'u1', email: 'a@b.com' };
        mockAuthService.register.mockResolvedValue(user);
        const res = await controller.register({ email: 'a@b.com', password: 'pw' } as any);
        expect(res).toEqual({ status: 'ok', user });
        expect(mockAuthService.register).toHaveBeenCalled();
    });
});


describe('login', () => {
    it('returns status ok and token', async () => {
        mockAuthService.login.mockResolvedValue({ access_token: 't', expires_in: 3600 });
        const res = await controller.login({ email: 'a@b.com', password: 'pw' } as any);
        expect(res).toEqual({ status: 'ok', access_token: 't', expires_in: 3600 });
        expect(mockAuthService.login).toHaveBeenCalled();
    });
});


describe('me', () => {
    it('throws UnauthorizedException when req.user missing', async () => {
        await expect(controller.me({} as any)).rejects.toThrow(UnauthorizedException);
    });


    it('throws UnauthorizedException when user id not present in token', async () => {
        const req = { user: {} } as any;
        await expect(controller.me(req)).rejects.toThrow(UnauthorizedException);
    });


    it('throws NotFoundException when user not in DB', async () => {
        const req = { user: { sub: 'uid-5' } } as any;
        mockPrisma.user.findUnique.mockResolvedValue(null);
        await expect(controller.me(req)).rejects.toThrow(NotFoundException);
        expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'uid-5' }, select: { id: true, email: true } });
    });


    it('returns user when found', async () => {
        const req = { user: { sub: 'uid-5' } } as any;
        const user = { id: 'uid-5', email: 'found@example.com' };
        mockPrisma.user.findUnique.mockResolvedValue(user);
        const res = await controller.me(req);
        expect(res).toEqual(user);
    });


    it('also accepts id property instead of sub', async () => {
        const req = { user: { id: 'uid-99' } } as any;
        const user = { id: 'uid-99', email: 'found2@example.com' };
        mockPrisma.user.findUnique.mockResolvedValue(user);
        const res = await controller.me(req);
        expect(res).toEqual(user);
    });
});
});