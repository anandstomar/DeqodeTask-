import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, NotFoundException, UnauthorizedException, Req, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorator/public.decorator';
import { PrismaService } from '../database/prisma.service';


@Controller('auth')
export class AuthController {
  constructor(
  private readonly authService: AuthService,
  private readonly prisma: PrismaService
  ) {}

  @Public()
  @Post('register')
  async register(@Body() body: RegisterDto) {
    const user = await this.authService.register(body);
    return { status: 'ok', user };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() body: LoginDto) {
    const token = await this.authService.login(body);
    return { status: 'ok', ...token };
  }


  @Get('me')
  async me(@Req() req: any) {
    const jwtUser = req.user;
    if (!jwtUser) {
      throw new UnauthorizedException('Missing token user payload');
    }

    const userId = jwtUser.sub ?? jwtUser.id ?? null;
    if (!userId) {
      throw new UnauthorizedException('User id not present in token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true }
    });

    if (!user) {
      throw new NotFoundException('Authenticated user not found in DB');
    }

    return user;
  }
}

