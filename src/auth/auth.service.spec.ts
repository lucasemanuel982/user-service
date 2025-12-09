import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import { PasswordService } from './services/password.service';
import { AuthJwtService } from './services/jwt.service';

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: PrismaService;
  let passwordService: PasswordService;
  let jwtService: AuthJwtService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockPasswordService = {
    hashPassword: jest.fn(),
    verifyPassword: jest.fn(),
  };

  const mockJwtService = {
    generateTokens: jest.fn(),
    verifyRefreshToken: jest.fn(),
    refreshAccessToken: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: PasswordService,
          useValue: mockPasswordService,
        },
        {
          provide: AuthJwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    passwordService = module.get<PasswordService>(PasswordService);
    jwtService = module.get<AuthJwtService>(AuthJwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('deve criar um novo usuário com sucesso', async () => {
      const registerDto = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPasswordService.hashPassword.mockResolvedValue('hashed:password');
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user-id',
        name: 'Test User',
        email: 'test@example.com',
        createdAt: new Date(),
      });

      const result = await service.register(registerDto);

      expect(result).toHaveProperty('message', 'Usuário criado com sucesso');
      expect(result).toHaveProperty('user');
      expect(mockPasswordService.hashPassword).toHaveBeenCalledWith(
        'password123',
      );
      expect(mockPrismaService.user.create).toHaveBeenCalled();
    });

    it('deve lançar ConflictException se email já existe', async () => {
      const registerDto = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      };

      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'existing-user-id',
        email: 'test@example.com',
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    it('deve autenticar usuário e retornar tokens', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        passwordHash: 'hashed:password',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPasswordService.verifyPassword.mockResolvedValue(true);
      mockJwtService.generateTokens.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      expect(mockPasswordService.verifyPassword).toHaveBeenCalled();
    });

    it('deve lançar UnauthorizedException se email não existe', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar UnauthorizedException se senha estiver incorreta', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'wrong-password',
      };

      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        passwordHash: 'hashed:password',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPasswordService.verifyPassword.mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    it('deve renovar access token com refresh token válido', async () => {
      const refreshDto = {
        refreshToken: 'valid-refresh-token',
      };

      const mockPayload = {
        sub: 'user-id',
        email: 'test@example.com',
      };

      mockJwtService.verifyRefreshToken.mockResolvedValue(mockPayload);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
      });
      mockJwtService.refreshAccessToken.mockResolvedValue('new-access-token');

      const result = await service.refresh(refreshDto);

      expect(result).toHaveProperty('accessToken', 'new-access-token');
    });

    it('deve lançar UnauthorizedException se refresh token for inválido', async () => {
      const refreshDto = {
        refreshToken: 'invalid-refresh-token',
      };

      mockJwtService.verifyRefreshToken.mockRejectedValue(
        new UnauthorizedException(),
      );

      await expect(service.refresh(refreshDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});

