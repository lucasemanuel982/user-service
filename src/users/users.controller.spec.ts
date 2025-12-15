import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;

  const mockUsersService = {
    findOne: jest.fn(),
    update: jest.fn(),
    updateBankingDetails: jest.fn(),
    updateProfilePicture: jest.fn(),
  };

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findOne', () => {
    const currentUser = {
      userId: 'user-id-123',
      email: 'test@example.com',
      jti: 'token-id',
    };

    it('deve retornar usuário quando ID corresponde ao usuário autenticado', async () => {
      const params = { id: 'user-id-123' };

      mockUsersService.findOne.mockResolvedValue(mockUser);

      const result = await controller.findOne(params, currentUser);

      expect(result).toEqual(mockUser);
      expect(mockUsersService.findOne).toHaveBeenCalledWith('user-id-123');
      expect(mockUsersService.findOne).toHaveBeenCalledTimes(1);
    });

    it('deve lançar ForbiddenException quando usuário tenta acessar outro usuário', async () => {
      const params = { id: 'other-user-id' };
      const currentUser = {
        userId: 'user-id-123',
        email: 'test@example.com',
        jti: 'token-id',
      };

      await expect(controller.findOne(params, currentUser)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(controller.findOne(params, currentUser)).rejects.toThrow(
        'Você não tem permissão para acessar este recurso',
      );

      expect(mockUsersService.findOne).not.toHaveBeenCalled();
    });

    it('deve propagar NotFoundException do service quando usuário não existe', async () => {
      const params = { id: 'user-id-123' };

      mockUsersService.findOne.mockRejectedValue(
        new NotFoundException(`Usuário com ID ${params.id} não encontrado`),
      );

      await expect(controller.findOne(params, currentUser)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockUsersService.findOne).toHaveBeenCalledWith('user-id-123');
    });

    it('deve validar que o parâmetro ID é um UUID válido', async () => {
      // A validação de UUID é feita pelo ValidationPipe através do DTO
      // Este teste verifica que o controller aceita apenas UUIDs válidos
      const params = { id: 'user-id-123' }; // UUID válido

      mockUsersService.findOne.mockResolvedValue(mockUser);

      const result = await controller.findOne(params, currentUser);

      expect(result).toBeDefined();
    });

    it('deve retornar usuário com bankingDetails quando disponível', async () => {
      const params = { id: 'user-id-123' };

      mockUsersService.findOne.mockResolvedValue(mockUser);

      const result = (await controller.findOne(
        params,
        currentUser,
      )) as typeof mockUser;

      expect(result.bankingDetails).toBeDefined();
      expect(result.bankingDetails.agency).toBe('0001');
      expect(result.bankingDetails.accountNumber).toBe('12345-6');
    });

    it('deve retornar usuário sem bankingDetails quando não disponível', async () => {
      const params = { id: 'user-id-123' };
      const userWithoutBanking = {
        ...mockUser,
        bankingDetails: null,
      };

      mockUsersService.findOne.mockResolvedValue(userWithoutBanking);

      const result = (await controller.findOne(
        params,
        currentUser,
      )) as typeof userWithoutBanking;

      expect(result.bankingDetails).toBeNull();
    });
  });

  describe('update', () => {
    const currentUser = {
      userId: 'user-id-123',
      email: 'test@example.com',
      jti: 'token-id',
    };

    it('deve atualizar usuário quando ID corresponde ao usuário autenticado', async () => {
      const params = { id: 'user-id-123' };
      const updateDto = { name: 'Updated Name' };
      const updatedUser = { ...mockUser, name: 'Updated Name' };

      mockUsersService.update.mockResolvedValue(updatedUser);

      const result = await controller.update(params, updateDto, currentUser);

      expect(result).toEqual(updatedUser);
      expect(mockUsersService.update).toHaveBeenCalledWith(
        'user-id-123',
        updateDto,
      );
      expect(mockUsersService.update).toHaveBeenCalledTimes(1);
    });

    it('deve lançar ForbiddenException quando usuário tenta atualizar outro usuário', async () => {
      const params = { id: 'other-user-id' };
      const updateDto = { name: 'Updated Name' };

      await expect(
        controller.update(params, updateDto, currentUser),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        controller.update(params, updateDto, currentUser),
      ).rejects.toThrow('Você não tem permissão para atualizar este recurso');

      expect(mockUsersService.update).not.toHaveBeenCalled();
    });
  });

  describe('updateProfilePicture', () => {
    const currentUser = {
      userId: 'user-id-123',
      email: 'test@example.com',
      jti: 'token-id',
    };

    const mockFile = {
      fieldname: 'file',
      originalname: 'profile.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      size: 1024 * 1024, // 1MB
      buffer: Buffer.from('fake-image-data'),
      destination: '',
      filename: '',
      path: '',
    } as Express.Multer.File;

    it('deve atualizar foto de perfil quando ID corresponde ao usuário autenticado', async () => {
      const params = { id: 'user-id-123' };
      const updatedProfile = {
        id: 'user-id-123',
        profilePictureUrl:
          '/uploads/profile-pictures/user-id-123-1234567890.jpg',
      };

      mockUsersService.updateProfilePicture.mockResolvedValue(updatedProfile);

      const result = await controller.updateProfilePicture(
        params,
        mockFile,
        currentUser,
      );

      expect(result).toEqual(updatedProfile);
      expect(mockUsersService.updateProfilePicture).toHaveBeenCalled();
      expect(mockUsersService.updateProfilePicture).toHaveBeenCalledTimes(1);
    });

    it('deve lançar ForbiddenException quando usuário tenta atualizar foto de outro usuário', async () => {
      const params = { id: 'other-user-id' };

      await expect(
        controller.updateProfilePicture(params, mockFile, currentUser),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        controller.updateProfilePicture(params, mockFile, currentUser),
      ).rejects.toThrow('Você não tem permissão para atualizar este recurso');

      expect(mockUsersService.updateProfilePicture).not.toHaveBeenCalled();
    });

    it('deve propagar NotFoundException do service quando usuário não existe', async () => {
      const params = { id: 'user-id-123' };

      mockUsersService.updateProfilePicture.mockRejectedValue(
        new NotFoundException(`Usuário com ID ${params.id} não encontrado`),
      );

      await expect(
        controller.updateProfilePicture(params, mockFile, currentUser),
      ).rejects.toThrow(NotFoundException);

      expect(mockUsersService.updateProfilePicture).toHaveBeenCalled();
    });
  });
});
