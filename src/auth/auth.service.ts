import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PasswordService } from './services/password.service';
import { AuthJwtService } from './services/jwt.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: AuthJwtService,
  ) {}

  /**
   * Registra um novo usuário
   */
  async register(registerDto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email já está em uso');
    }

    const passwordHash = await this.passwordService.hashPassword(
      registerDto.password,
    );

    const user = await this.prisma.user.create({
      data: {
        name: registerDto.name,
        email: registerDto.email,
        address: registerDto.address,
        passwordHash,
      },
      select: {
        id: true,
        name: true,
        email: true,
        address: true,
        createdAt: true,
      },
    });

    this.logger.log(`Usuário registrado: ${user.id}`);

    return {
      message: 'Usuário criado com sucesso',
      user,
    };
  }

  /**
   * Autentica um usuário e retorna tokens
   */
  async login(loginDto: LoginDto) {
    // Busca usuário por email
    const user = (await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    })) as {
      id: string;
      email: string;
      name: string;
      passwordHash: string;
    } | null;

    if (!user) {
      this.logger.warn(
        `Tentativa de login com email inexistente: ${loginDto.email}`,
      );
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const isPasswordValid = await this.passwordService.verifyPassword(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      this.logger.warn(
        `Tentativa de login com senha incorreta para: ${loginDto.email}`,
      );
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const tokens = await this.jwtService.generateTokens(user.id, user.email);

    this.logger.log(`Login bem-sucedido: ${user.id}`);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    };
  }

  /**
   * Renova access token usando refresh token
   */
  async refresh(refreshDto: RefreshDto) {
    try {
      const payload = await this.jwtService.verifyRefreshToken(
        refreshDto.refreshToken,
      );

      const user = (await this.prisma.user.findUnique({
        where: { id: payload.sub },
      })) as { id: string; email: string } | null;

      if (!user) {
        throw new UnauthorizedException('Usuário não encontrado');
      }

      const accessToken = await this.jwtService.refreshAccessToken(
        refreshDto.refreshToken,
      );

      return {
        accessToken,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Refresh token inválido');
    }
  }

  /**
   * Faz logout (adiciona token à blacklist)
   */
  async logout(accessToken: string, refreshToken?: string): Promise<void> {
    try {
      const accessPayload =
        await this.jwtService.verifyAccessToken(accessToken);
      const expiresIn = accessPayload.exp
        ? accessPayload.exp - Math.floor(Date.now() / 1000)
        : 1200; // 20 minutos padrão

      await this.jwtService.blacklistToken(accessPayload.jti!, expiresIn);

      if (refreshToken) {
        try {
          const refreshPayload =
            await this.jwtService.verifyRefreshToken(refreshToken);
          const refreshExpiresIn = refreshPayload.exp
            ? refreshPayload.exp - Math.floor(Date.now() / 1000)
            : 604800; // 7 dias padrão

          await this.jwtService.blacklistToken(
            refreshPayload.jti!,
            refreshExpiresIn,
          );
        } catch {
          this.logger.warn('Erro no refresh token');
        }
      }

      this.logger.log(`Logout realizado para usuário: ${accessPayload.sub}`);
    } catch (error) {
      this.logger.warn('Erro ao fazer logout:', error);
    }
  }
}
