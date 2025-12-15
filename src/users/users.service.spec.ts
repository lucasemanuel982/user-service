import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EventPublisherService } from '../messaging/event-publisher.service';

describe('UsersService', () => {
  let service: UsersService;

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

  const mockEventPublisherService = {
    publishBankingDetailsUpdated: jest.fn(),
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
        {
          provide: EventPublisherService,
          useValue: mockEventPublisherService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
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
      // Serializa e deserializa para simular o comportamento do Redis
      const cachedUser = JSON.stringify(mockUser);

      mockRedisService.get.mockResolvedValue(cachedUser);

      const result = await service.findOne(userId);

      // Quando vem do cache, as datas são strings (JSON serialization)
      expect(result).toBeDefined();
      expect(result.id).toBe(mockUser.id);
      expect(result.name).toBe(mockUser.name);
      expect(result.email).toBe(mockUser.email);
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

      const result = (await service.findOne(
        userId,
      )) as typeof userWithoutBanking;

      expect(result.bankingDetails).toBeNull();
      expect(result).toEqual(userWithoutBanking);
    });
  });

  describe('update', () => {
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
        accountNumber: '12345',
        updatedAt: new Date(),
      },
    };

    it('deve atualizar apenas o nome do usuário', async () => {
      const userId = 'user-id-123';
      const updateDto = { name: 'Updated Name' };
      const updatedUser = { ...mockUser, name: 'Updated Name' };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);
      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrismaService.user.findUnique.mockResolvedValueOnce(updatedUser);
      mockRedisService.del.mockResolvedValue(1);

      await service.update(userId, updateDto);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        include: { bankingDetails: true },
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { name: 'Updated Name' },
        include: { bankingDetails: true },
      });
      expect(mockRedisService.del).toHaveBeenCalledWith(`user:${userId}`);
      expect(
        mockEventPublisherService.publishBankingDetailsUpdated,
      ).not.toHaveBeenCalled();
    });

    it('deve atualizar apenas o email do usuário', async () => {
      const userId = 'user-id-123';
      const updateDto = { email: 'newemail@example.com' };
      const updatedUser = { ...mockUser, email: 'newemail@example.com' };

      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);
      mockPrismaService.user.findUnique.mockResolvedValueOnce(updatedUser);
      mockRedisService.del.mockResolvedValue(1);

      await service.update(userId, updateDto);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { email: 'newemail@example.com' },
        include: { bankingDetails: true },
      });
      expect(mockRedisService.del).toHaveBeenCalledWith(`user:${userId}`);
    });

    it('deve atualizar apenas o endereço do usuário', async () => {
      const userId = 'user-id-123';
      const updateDto = { address: 'New Address' };
      const updatedUser = { ...mockUser, address: 'New Address' };

      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);
      mockPrismaService.user.findUnique.mockResolvedValueOnce(updatedUser);
      mockRedisService.del.mockResolvedValue(1);

      await service.update(userId, updateDto);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { address: 'New Address' },
        include: { bankingDetails: true },
      });
      expect(mockRedisService.del).toHaveBeenCalledWith(`user:${userId}`);
    });

    it('deve atualizar múltiplos campos do usuário', async () => {
      const userId = 'user-id-123';
      const updateDto = {
        name: 'Updated Name',
        email: 'newemail@example.com',
        address: 'New Address',
      };
      const updatedUser = { ...mockUser, ...updateDto };

      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);
      mockPrismaService.user.findUnique.mockResolvedValueOnce(updatedUser);
      mockRedisService.del.mockResolvedValue(1);

      await service.update(userId, updateDto);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: updateDto,
        include: { bankingDetails: true },
      });
      expect(mockRedisService.del).toHaveBeenCalledWith(`user:${userId}`);
    });

    it('deve atualizar apenas dados bancários e publicar evento', async () => {
      const userId = 'user-id-123';
      const updateDto = {
        bankingDetails: {
          agency: '0002',
          accountNumber: '54321',
        },
      };
      const updatedUser = {
        ...mockUser,
        bankingDetails: {
          ...mockUser.bankingDetails,
          agency: '0002',
          accountNumber: '54321',
        },
      };

      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrismaService.bankingDetails.upsert.mockResolvedValue(
        updatedUser.bankingDetails,
      );
      mockPrismaService.user.findUnique.mockResolvedValueOnce(updatedUser);
      mockRedisService.del.mockResolvedValue(1);
      mockEventPublisherService.publishBankingDetailsUpdated.mockResolvedValue(
        undefined,
      );

      await service.update(userId, updateDto);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        include: { bankingDetails: true },
      });
      expect(mockPrismaService.bankingDetails.upsert).toHaveBeenCalledWith({
        where: { userId },
        update: {
          agency: '0002',
          accountNumber: '54321',
        },
        create: {
          userId,
          agency: '0002',
          accountNumber: '54321',
        },
      });
      expect(
        mockEventPublisherService.publishBankingDetailsUpdated,
      ).toHaveBeenCalledWith(userId, {
        agency: '0002',
        account: '54321',
      });
      expect(mockRedisService.del).toHaveBeenCalledWith(`user:${userId}`);
    });

    it('deve atualizar dados do usuário e dados bancários simultaneamente', async () => {
      const userId = 'user-id-123';
      const updateDto = {
        name: 'Updated Name',
        bankingDetails: {
          agency: '0002',
          accountNumber: '54321',
        },
      };
      const updatedUser = {
        ...mockUser,
        name: 'Updated Name',
        bankingDetails: {
          ...mockUser.bankingDetails,
          agency: '0002',
          accountNumber: '54321',
        },
      };

      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        name: 'Updated Name',
      });
      mockPrismaService.bankingDetails.upsert.mockResolvedValue(
        updatedUser.bankingDetails,
      );
      mockPrismaService.user.findUnique.mockResolvedValueOnce(updatedUser);
      mockRedisService.del.mockResolvedValue(1);
      mockEventPublisherService.publishBankingDetailsUpdated.mockResolvedValue(
        undefined,
      );

      await service.update(userId, updateDto);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { name: 'Updated Name' },
        include: { bankingDetails: true },
      });
      expect(mockPrismaService.bankingDetails.upsert).toHaveBeenCalled();
      expect(
        mockEventPublisherService.publishBankingDetailsUpdated,
      ).toHaveBeenCalled();
      expect(mockRedisService.del).toHaveBeenCalledWith(`user:${userId}`);
    });

    it('deve lançar NotFoundException quando usuário não existe', async () => {
      const userId = 'non-existent-id';
      const updateDto = { name: 'Updated Name' };

      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.update(userId, updateDto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.update(userId, updateDto)).rejects.toThrow(
        `Usuário com ID ${userId} não encontrado`,
      );
    });

    it('deve lançar BadRequestException quando ID é vazio', async () => {
      const updateDto = { name: 'Updated Name' };

      await expect(service.update('', updateDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.update('', updateDto)).rejects.toThrow(
        'ID do usuário é obrigatório',
      );
    });

    it('deve lançar BadRequestException quando nenhum campo é fornecido', async () => {
      const userId = 'user-id-123';
      const updateDto = {};

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.update(userId, updateDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.update(userId, updateDto)).rejects.toThrow(
        'Pelo menos um campo deve ser fornecido para atualização',
      );
    });

    it('deve continuar funcionando mesmo se o evento falhar ao ser publicado', async () => {
      const userId = 'user-id-123';
      const updateDto = {
        bankingDetails: {
          agency: '0002',
          accountNumber: '54321',
        },
      };
      const updatedUser = {
        ...mockUser,
        bankingDetails: {
          ...mockUser.bankingDetails,
          agency: '0002',
          accountNumber: '54321',
        },
      };

      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrismaService.bankingDetails.upsert.mockResolvedValue(
        updatedUser.bankingDetails,
      );
      mockPrismaService.user.findUnique.mockResolvedValueOnce(updatedUser);
      mockRedisService.del.mockResolvedValue(1);
      mockEventPublisherService.publishBankingDetailsUpdated.mockRejectedValue(
        new Error('Event publishing failed'),
      );

      await service.update(userId, updateDto);

      expect(mockPrismaService.bankingDetails.upsert).toHaveBeenCalled();
      expect(
        mockEventPublisherService.publishBankingDetailsUpdated,
      ).toHaveBeenCalled();
    });

    it('deve continuar funcionando mesmo se o cache falhar ao ser invalidado', async () => {
      const userId = 'user-id-123';
      const updateDto = { name: 'Updated Name' };
      const updatedUser = { ...mockUser, name: 'Updated Name' };

      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);
      mockPrismaService.user.findUnique.mockResolvedValueOnce(updatedUser);
      mockRedisService.del.mockRejectedValue(new Error('Cache error'));

      await service.update(userId, updateDto);

      expect(mockPrismaService.user.update).toHaveBeenCalled();
      expect(mockRedisService.del).toHaveBeenCalled();
    });

    it('deve criar dados bancários se não existirem', async () => {
      const userId = 'user-id-123';
      const userWithoutBanking = {
        ...mockUser,
        bankingDetails: null,
      };
      const updateDto = {
        bankingDetails: {
          agency: '0002',
          accountNumber: '54321',
        },
      };
      const updatedUser = {
        ...userWithoutBanking,
        bankingDetails: {
          id: 'new-banking-id',
          userId,
          agency: '0002',
          accountNumber: '54321',
          updatedAt: new Date(),
        },
      };

      mockPrismaService.user.findUnique.mockResolvedValueOnce(
        userWithoutBanking,
      );
      mockPrismaService.bankingDetails.upsert.mockResolvedValue(
        updatedUser.bankingDetails,
      );
      mockPrismaService.user.findUnique.mockResolvedValueOnce(updatedUser);
      mockRedisService.del.mockResolvedValue(1);
      mockEventPublisherService.publishBankingDetailsUpdated.mockResolvedValue(
        undefined,
      );

      await service.update(userId, updateDto);

      expect(mockPrismaService.bankingDetails.upsert).toHaveBeenCalledWith({
        where: { userId },
        update: {
          agency: '0002',
          accountNumber: '54321',
        },
        create: {
          userId,
          agency: '0002',
          accountNumber: '54321',
        },
      });
      expect(
        mockEventPublisherService.publishBankingDetailsUpdated,
      ).toHaveBeenCalled();
    });

    it('deve lançar InternalServerErrorException em caso de erro inesperado do Prisma', async () => {
      const userId = 'user-id-123';
      const updateDto = { name: 'Updated Name' };

      mockPrismaService.user.findUnique.mockRejectedValue(
        new Error('Database connection error'),
      );

      await expect(service.update(userId, updateDto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('updateProfilePicture', () => {
    const userId = 'user-id-123';
    const profilePictureUrl =
      '/uploads/profile-pictures/user-id-123-1234567890.jpg';
    const mockUser = {
      id: userId,
      name: 'Test User',
      email: 'test@example.com',
      address: 'Test Address',
      passwordHash: 'hashed-password',
      profilePictureUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('deve atualizar a foto de perfil do usuário', async () => {
      const updatedUser = {
        id: userId,
        profilePictureUrl,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);
      mockRedisService.del.mockResolvedValue(1);

      const result = await service.updateProfilePicture(
        userId,
        profilePictureUrl,
      );

      expect(result).toEqual(updatedUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { profilePictureUrl },
        select: {
          id: true,
          profilePictureUrl: true,
        },
      });
      expect(mockRedisService.del).toHaveBeenCalledWith(`user:${userId}`);
    });

    it('deve lançar NotFoundException quando usuário não existe', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProfilePicture(userId, profilePictureUrl),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.updateProfilePicture(userId, profilePictureUrl),
      ).rejects.toThrow(`Usuário com ID ${userId} não encontrado`);

      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('deve lançar BadRequestException quando ID é vazio', async () => {
      await expect(
        service.updateProfilePicture('', profilePictureUrl),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updateProfilePicture('', profilePictureUrl),
      ).rejects.toThrow('ID do usuário é obrigatório');
    });

    it('deve lançar BadRequestException quando URL é vazia', async () => {
      await expect(service.updateProfilePicture(userId, '')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.updateProfilePicture(userId, '')).rejects.toThrow(
        'URL da foto de perfil é obrigatória',
      );
    });

    it('deve continuar funcionando mesmo se o cache falhar ao ser invalidado', async () => {
      const updatedUser = {
        id: userId,
        profilePictureUrl,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);
      mockRedisService.del.mockRejectedValue(new Error('Cache error'));

      const result = await service.updateProfilePicture(
        userId,
        profilePictureUrl,
      );

      expect(result).toEqual(updatedUser);
      expect(mockPrismaService.user.update).toHaveBeenCalled();
    });

    it('deve lançar InternalServerErrorException em caso de erro inesperado do Prisma', async () => {
      mockPrismaService.user.findUnique.mockRejectedValue(
        new Error('Database connection error'),
      );

      await expect(
        service.updateProfilePicture(userId, profilePictureUrl),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
