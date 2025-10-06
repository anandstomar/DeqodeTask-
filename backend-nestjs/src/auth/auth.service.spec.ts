import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';


describe('AuthService', () => {
    let mockPrisma: any;
    let mockJwtService: any;
    let service: AuthService;


    beforeEach(() => {
        mockPrisma = {
            user: {
                findUnique: jest.fn(),
                create: jest.fn(),
            },
        };


        mockJwtService = {
            signAsync: jest.fn(),
            verifyAsync: jest.fn(),
            options: { signOptions: { expiresIn: 3600 } },
        };


        service = new AuthService(mockPrisma as any, mockJwtService as any);


        jest.clearAllMocks();
    });


    describe('register', () => {
        it('throws ConflictException when email already exists', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ id: '1', email: 'a@b.com' });
            await expect(service.register({ email: 'a@b.com', password: 'pass' } as any)).rejects.toThrow(ConflictException);
            expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'a@b.com' } });
        });


        it('creates and returns new user when email not present', async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);
            const hashed = 'hashed-pass';
            // @ts-ignore
            jest.spyOn(bcrypt, 'hash').mockResolvedValue(hashed as any);


            const created = { id: '123', email: 'x@y.com', createdAt: new Date() };
            mockPrisma.user.create.mockResolvedValue(created);


            const res = await service.register({ email: 'x@y.com', password: 'secret' } as any);
            expect(bcrypt.hash).toHaveBeenCalledWith('secret', expect.any(Number));
            expect(mockPrisma.user.create).toHaveBeenCalledWith({
                data: { email: 'x@y.com', password: hashed },
                select: { id: true, email: true, createdAt: true },
            });
            expect(res).toEqual(created);
        });
    });


    describe('validateUser', () => {
        it('returns safe user when credentials are valid', async () => {
            const dbUser = { id: 'u1', email: 'u@e.com', password: 'hashed' };
            mockPrisma.user.findUnique.mockResolvedValue(dbUser);
            // @ts-ignore
            jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as any);


            const res = await service.validateUser('u@e.com', 'plain');
            expect(res).toEqual({ id: 'u1', email: 'u@e.com' });
        });


        it('returns null when user not found', async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);
            const res = await service.validateUser('no@one.com', 'x');
            expect(res).toBeNull();
        });


        it('returns null when password mismatch', async () => {
            const dbUser = { id: 'u1', email: 'u@e.com', password: 'hashed' };
            mockPrisma.user.findUnique.mockResolvedValue(dbUser);
            // @ts-ignore
            jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as any);


            const res = await service.validateUser('u@e.com', 'bad');
            expect(res).toBeNull();
        });
    });


    describe('login', () => {
        it('returns token payload on successful login', async () => {
            const dbUser = { id: 'u2', email: 'user@example.com', password: 'hashed' };
            mockPrisma.user.findUnique.mockResolvedValue(dbUser);
            // @ts-ignore
            jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as any);
            mockJwtService.signAsync.mockResolvedValue('jwt-token');


            const res = await service.login({ email: 'user@example.com', password: 'pw' } as any);
            expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'user@example.com' } });
            expect(res).toEqual({ access_token: 'jwt-token', expires_in: 3600 });
        });


        it('throws UnauthorizedException when user not found', async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);
            await expect(service.login({ email: 'x@x.com', password: 'x' } as any)).rejects.toThrow(UnauthorizedException);
        });


        it('throws UnauthorizedException when password invalid', async () => {
            const dbUser = { id: 'u2', email: 'user@example.com', password: 'hashed' };
            mockPrisma.user.findUnique.mockResolvedValue(dbUser);
            // @ts-ignore
            jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as any);


            await expect(service.login({ email: 'user@example.com', password: 'bad' } as any)).rejects.toThrow(UnauthorizedException);
        });
    });


    describe('generateTokenForUser & verifyToken', () => {
        it('generates token for user', async () => {
            mockJwtService.signAsync.mockResolvedValue('signed-token');
            const token = await service.generateTokenForUser('uid-1', 'e@e.com');
            expect(token).toBe('signed-token');
            expect(mockJwtService.signAsync).toHaveBeenCalledWith({ sub: 'uid-1', email: 'e@e.com' });
        });


        it('verifies token and returns payload', async () => {
            const payload = { sub: 'uid-1', email: 'a@b.com' };
            mockJwtService.verifyAsync.mockResolvedValue(payload);
            const res = await service.verifyToken('some-token');
            expect(res).toEqual(payload);
            expect(mockJwtService.verifyAsync).toHaveBeenCalledWith('some-token');
        });
    });
});