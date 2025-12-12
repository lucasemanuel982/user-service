import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../../redis/redis.service';
import { randomUUID } from 'crypto';

export interface JwtPayload {
  sub: string; // userId
  email: string;
  jti?: string; // JWT ID (para blacklist)
  iat?: number;
  exp?: number;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthJwtService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpiresIn: string;
  private readonly refreshTokenExpiresIn: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly redis: RedisService,
  ) {
    this.accessTokenSecret =
      process.env.JWT_SECRET ||
      'your-super-secret-jwt-key-change-in-production';
    this.refreshTokenSecret =
      process.env.JWT_REFRESH_SECRET ||
      'your-super-secret-refresh-jwt-key-change-in-production';

    // Tempos de expiração configuráveis via variáveis de ambiente
    // Formato aceito: números seguidos de 's' (segundos), 'm' (minutos), 'h' (horas), 'd' (dias)
    // Exemplos: '20m', '1200s', '7d', '1h'
    this.accessTokenExpiresIn =
      process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || '20m';
    this.refreshTokenExpiresIn =
      process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || '7d';
  }

  /**
   * Gera access token e refresh token
   */
  async generateTokens(userId: string, email: string): Promise<TokenResponse> {
    const jti = randomUUID();

    const accessTokenPayload: JwtPayload = {
      sub: userId,
      email,
      jti,
    };

    const refreshTokenPayload: JwtPayload = {
      sub: userId,
      email,
      jti,
    };

    const [accessToken, refreshToken] = (await Promise.all([
      this.jwtService.signAsync(accessTokenPayload, {
        secret: this.accessTokenSecret,
        expiresIn: this.accessTokenExpiresIn,
      } as any),
      this.jwtService.signAsync(refreshTokenPayload, {
        secret: this.refreshTokenSecret,
        expiresIn: this.refreshTokenExpiresIn,
      } as any),
    ])) as [string, string];

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * Verifica e decodifica access token
   */
  async verifyAccessToken(token: string): Promise<JwtPayload> {
    try {
      const payload = (await this.jwtService.verifyAsync(token, {
        secret: this.accessTokenSecret,
      })) as JwtPayload;

      // Verifica se token está na blacklist
      const isBlacklisted = await this.isTokenBlacklisted(payload.jti);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token revogado');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
  }

  /**
   * Verifica e decodifica refresh token
   */
  async verifyRefreshToken(token: string): Promise<JwtPayload> {
    try {
      const payload = (await this.jwtService.verifyAsync(token, {
        secret: this.refreshTokenSecret,
      })) as JwtPayload;

      // Verifica se token está na blacklist
      const isBlacklisted = await this.isTokenBlacklisted(payload.jti);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token revogado');
      }

      return payload;
    } catch (error) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }
  }

  /**
   * Adiciona token à blacklist
   */
  async blacklistToken(jti: string, expiresIn: number): Promise<void> {
    const key = `token:blacklist:${jti}`;
    // TTL baseado no tempo de expiração do token (em segundos)
    const ttl = Math.max(expiresIn - Math.floor(Date.now() / 1000), 0);

    if (ttl > 0) {
      await this.redis.set(
        key,
        JSON.stringify({ jti, revokedAt: new Date().toISOString() }),
        ttl,
      );
    }
  }

  /**
   * Verifica se token está na blacklist
   */
  async isTokenBlacklisted(jti?: string): Promise<boolean> {
    if (!jti) {
      return false;
    }

    const key = `token:blacklist:${jti}`;
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  /**
   * Gera novo access token a partir de refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<string> {
    const payload = await this.verifyRefreshToken(refreshToken);

    const newAccessTokenPayload: JwtPayload = {
      sub: payload.sub,
      email: payload.email,
      jti: randomUUID(), // Novo JTI para o access token
    };

    return this.jwtService.signAsync(newAccessTokenPayload, {
      secret: this.accessTokenSecret,
      expiresIn: this.accessTokenExpiresIn,
    } as any) as Promise<string>;
  }
}
