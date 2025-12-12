import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('UsersService', () => {
  let service: UsersService;
  let prismaService: PrismaService;
  let redisService: RedisService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    bankingDetails: {
      upsert: jest.fn(),
    },
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findOne', () => {
    const mockUser = {
      id: 'user-id-123',
      name: 'Test User',
      email: 'test@example.com',
      address: 'Test Address',
      passwordHash: 'hashed-password',
      profilePictureUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      bankingDetails: {
        id: 'banking-id',
        userId: 'user-id-123',
        agency: '0001',
        accountNumber: '12345-6',
        updatedAt: new Date(),
      },
    };

    it('deve retornar usuário do cache quando disponível', async () => {
      const userId = 'user-id-123';
      const cachedUser = JSON.stringify(mockUser);

      mockRedisService.get.mockResolvedValue(cachedUser);

      const result = await service.findOne(userId);

      expect(result).toEqual(mockUser);
      expect(mockRedisService.get).toHaveBeenCalledWith(`user:${userId}`);
      expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled();
    });

    it('deve buscar do banco quando não há cache e armazenar no cache', async () => {
      const userId = 'user-id-123';

      mockRedisService.get.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockRedisService.set.mockResolvedValue('OK');

      const result = await service.findOne(userId);

      expect(result).toEqual(mockUser);
      expect(mockRedisService.get).toHaveBeenCalledWith(`user:${userId}`);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        include: { bankingDetails: true },
      });
      expect(mockRedisService.set).toHaveBeenCalledWith(
        `user:${userId}`,
        JSON.stringify(mockUser),
        3600,
      );
    });

    it('deve lançar NotFoundException quando usuário não existe', async () => {
      const userId = 'non-existent-id';

      mockRedisService.get.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne(userId)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(userId)).rejects.toThrow(
        `Usuário com ID ${userId} não encontrado`,
      );
    });

    it('deve lançar NotFoundException quando ID é vazio', async () => {
      await expect(service.findOne('')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('')).rejects.toThrow(
        'ID do usuário é obrigatório',
      );
    });

    it('deve continuar funcionando mesmo se o cache falhar ao armazenar', async () => {
      const userId = 'user-id-123';

      mockRedisService.get.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockRedisService.set.mockRejectedValue(new Error('Cache error'));

      const result = await service.findOne(userId);

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalled();
    });

    it('deve buscar do banco se o cache retornar JSON inválido', async () => {
      const userId = 'user-id-123';
      const invalidCache = 'invalid-json';

      mockRedisService.get.mockResolvedValue(invalidCache);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockRedisService.set.mockResolvedValue('OK');

      const result = await service.findOne(userId);

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalled();
    });

    it('deve lançar InternalServerErrorException em caso de erro inesperado do Prisma', async () => {
      const userId = 'user-id-123';

      mockRedisService.get.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockRejectedValue(
        new Error('Database connection error'),
      );

      await expect(service.findOne(userId)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('deve retornar usuário sem bankingDetails quando não existir', async () => {
      const userId = 'user-id-123';
      const userWithoutBanking = {
        ...mockUser,
        bankingDetails: null,
      };

      mockRedisService.get.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValue(userWithoutBanking);
      mockRedisService.set.mockResolvedValue('OK');

      const result = await service.findOne(userId);

      expect(result.bankingDetails).toBeNull();
      expect(result).toEqual(userWithoutBanking);
    });
  });
});
