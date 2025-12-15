import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AuthJwtService, JwtPayload } from './jwt.service';
import { RedisService } from '../../redis/redis.service';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthJwtService', () => {
  let service: AuthJwtService;
  let jwtService: JwtService;
  let redisService: RedisService;

  const mockRedisService = {
    set: jest.fn(),
    exists: jest.fn(),
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '20m' },
        }),
      ],
      providers: [
        AuthJwtService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<AuthJwtService>(AuthJwtService);
    jwtService = module.get<JwtService>(JwtService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateTokens', () => {
    it('deve gerar access token e refresh token', async () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const role = 'user';

      const tokens = await service.generateTokens(userId, email, role);

      expect(tokens).toBeDefined();
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
    });

    it('deve gerar tokens com payload correto', async () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const role = 'user';

      const tokens = await service.generateTokens(userId, email, role);
      const accessPayload = jwtService.decode(tokens.accessToken) as JwtPayload;
      const refreshPayload = jwtService.decode(tokens.refreshToken) as JwtPayload;

      expect(accessPayload.sub).toBe(userId);
      expect(accessPayload.email).toBe(email);
      expect(accessPayload.role).toBe(role);
      expect(accessPayload.jti).toBeDefined();

      expect(refreshPayload.sub).toBe(userId);
      expect(refreshPayload.email).toBe(email);
      expect(refreshPayload.role).toBe(role);
      expect(refreshPayload.jti).toBeDefined();
    });

    it('deve gerar tokens sem role quando não fornecida', async () => {
      const userId = 'user-123';
      const email = 'test@example.com';

      const tokens = await service.generateTokens(userId, email);
      const accessPayload = jwtService.decode(tokens.accessToken) as JwtPayload;

      expect(accessPayload.sub).toBe(userId);
      expect(accessPayload.email).toBe(email);
      expect(accessPayload.role).toBeUndefined();
    });

    it('deve gerar JTI para access e refresh token', async () => {
      const userId = 'user-123';
      const email = 'test@example.com';

      const tokens = await service.generateTokens(userId, email);
      const accessPayload = jwtService.decode(tokens.accessToken) as JwtPayload;
      const refreshPayload = jwtService.decode(tokens.refreshToken) as JwtPayload;

      expect(accessPayload.jti).toBeDefined();
      expect(refreshPayload.jti).toBeDefined();
      // Nota: O código atual gera o mesmo JTI para ambos os tokens
      // Isso é intencional para rastreamento, mas pode ser alterado se necessário
      expect(accessPayload.jti).toBe(refreshPayload.jti);
    });
  });

  describe('verifyAccessToken', () => {
    it('deve verificar token válido', async () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const tokens = await service.generateTokens(userId, email);

      mockRedisService.exists.mockResolvedValue(0);

      const payload = await service.verifyAccessToken(tokens.accessToken);

      expect(payload).toBeDefined();
      expect(payload.sub).toBe(userId);
      expect(payload.email).toBe(email);
      expect(mockRedisService.exists).toHaveBeenCalled();
    });

    it('deve lançar exceção para token inválido', async () => {
      const invalidToken = 'invalid-token';

      await expect(service.verifyAccessToken(invalidToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar exceção para token expirado', async () => {
      const expiredToken = jwtService.sign(
        { sub: 'user-123', email: 'test@example.com' },
        { secret: 'test-secret', expiresIn: '-1s' },
      );

      await expect(service.verifyAccessToken(expiredToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar exceção para token na blacklist', async () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const tokens = await service.generateTokens(userId, email);
      const payload = jwtService.decode(tokens.accessToken) as JwtPayload;

      mockRedisService.exists.mockResolvedValue(1);

      await expect(service.verifyAccessToken(tokens.accessToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRedisService.exists).toHaveBeenCalledWith(
        `token:blacklist:${payload.jti}`,
      );
    });

    it('deve verificar token sem JTI (isTokenBlacklisted retorna false)', async () => {
      // Usa o secret correto do service (vem de process.env ou default)
      const tokenWithoutJti = jwtService.sign(
        { sub: 'user-123', email: 'test@example.com' },
        { 
          secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
          expiresIn: '20m'
        },
      );

      // Quando não há JTI, isTokenBlacklisted retorna false sem chamar Redis
      const payload = await service.verifyAccessToken(tokenWithoutJti);

      expect(payload).toBeDefined();
      expect(payload.sub).toBe('user-123');
      // isTokenBlacklisted retorna false quando jti é undefined, então exists não é chamado
      expect(mockRedisService.exists).not.toHaveBeenCalled();
    });
  });

  describe('verifyRefreshToken', () => {
    it('deve verificar refresh token válido', async () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const tokens = await service.generateTokens(userId, email);

      mockRedisService.exists.mockResolvedValue(0);

      const payload = await service.verifyRefreshToken(tokens.refreshToken);

      expect(payload).toBeDefined();
      expect(payload.sub).toBe(userId);
      expect(payload.email).toBe(email);
    });

    it('deve lançar exceção para refresh token inválido', async () => {
      const invalidToken = 'invalid-token';

      await expect(service.verifyRefreshToken(invalidToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar exceção para refresh token na blacklist', async () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const tokens = await service.generateTokens(userId, email);
      const payload = jwtService.decode(tokens.refreshToken) as JwtPayload;

      mockRedisService.exists.mockResolvedValue(1);

      await expect(service.verifyRefreshToken(tokens.refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('blacklistToken', () => {
    it('deve adicionar token à blacklist', async () => {
      const jti = 'token-id-123';
      const expiresIn = Math.floor(Date.now() / 1000) + 3600; // 1 hora no futuro

      mockRedisService.set.mockResolvedValue('OK');

      await service.blacklistToken(jti, expiresIn);

      expect(mockRedisService.set).toHaveBeenCalledWith(
        `token:blacklist:${jti}`,
        expect.stringContaining(jti),
        expect.any(Number),
      );
    });

    it('não deve adicionar token expirado à blacklist', async () => {
      const jti = 'token-id-123';
      const expiresIn = Math.floor(Date.now() / 1000) - 3600; // 1 hora no passado

      await service.blacklistToken(jti, expiresIn);

      expect(mockRedisService.set).not.toHaveBeenCalled();
    });
  });

  describe('isTokenBlacklisted', () => {
    it('deve retornar true se token está na blacklist', async () => {
      const jti = 'token-id-123';

      mockRedisService.exists.mockResolvedValue(1);

      const isBlacklisted = await service.isTokenBlacklisted(jti);

      expect(isBlacklisted).toBe(true);
      expect(mockRedisService.exists).toHaveBeenCalledWith(`token:blacklist:${jti}`);
    });

    it('deve retornar false se token não está na blacklist', async () => {
      const jti = 'token-id-123';

      mockRedisService.exists.mockResolvedValue(0);

      const isBlacklisted = await service.isTokenBlacklisted(jti);

      expect(isBlacklisted).toBe(false);
    });

    it('deve retornar false se JTI não for fornecido', async () => {
      const isBlacklisted = await service.isTokenBlacklisted(undefined);

      expect(isBlacklisted).toBe(false);
      expect(mockRedisService.exists).not.toHaveBeenCalled();
    });
  });

  describe('refreshAccessToken', () => {
    it('deve gerar novo access token a partir de refresh token', async () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const tokens = await service.generateTokens(userId, email);

      mockRedisService.exists.mockResolvedValue(0);

      const newAccessToken = await service.refreshAccessToken(tokens.refreshToken);

      expect(newAccessToken).toBeDefined();
      expect(typeof newAccessToken).toBe('string');

      const payload = jwtService.decode(newAccessToken) as JwtPayload;
      expect(payload.sub).toBe(userId);
      expect(payload.email).toBe(email);
      expect(payload.jti).toBeDefined();
    });

    it('deve gerar novo JTI para o access token', async () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const tokens = await service.generateTokens(userId, email);
      const refreshPayload = jwtService.decode(tokens.refreshToken) as JwtPayload;

      mockRedisService.exists.mockResolvedValue(0);

      const newAccessToken = await service.refreshAccessToken(tokens.refreshToken);
      const newAccessPayload = jwtService.decode(newAccessToken) as JwtPayload;

      expect(newAccessPayload.jti).toBeDefined();
      expect(newAccessPayload.jti).not.toBe(refreshPayload.jti);
    });

    it('deve lançar exceção para refresh token inválido', async () => {
      const invalidToken = 'invalid-token';

      await expect(service.refreshAccessToken(invalidToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve manter a role do refresh token no novo access token', async () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const role = 'admin';
      const tokens = await service.generateTokens(userId, email, role);

      mockRedisService.exists.mockResolvedValue(0);

      const newAccessToken = await service.refreshAccessToken(tokens.refreshToken);
      const payload = jwtService.decode(newAccessToken) as JwtPayload;

      expect(payload.role).toBe(role);
    });
  });
});
