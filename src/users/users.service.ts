import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateBankingDetailsDto } from './dto/update-banking-details.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly CACHE_TTL = parseInt(
    process.env.REDIS_CACHE_TTL || '3600',
    10,
  ); // 1 hora padrão

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Cria um novo usuário
   */
  async create(createUserDto: CreateUserDto) {
    // TODO: Implementar hash de senha no Card 22
    const user = await this.prisma.user.create({
      data: {
        name: createUserDto.name,
        email: createUserDto.email,
        address: createUserDto.address,
        passwordHash: createUserDto.password, // Será hasheado no Card 22
      },
    });

    this.logger.log(`Usuário criado: ${user.id}`);
    return user;
  }

  /**
   * Busca um usuário por ID
   */
  async findOne(id: string) {
    // Tenta buscar do cache primeiro
    const cacheKey = `user:${id}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      this.logger.debug(`Usuário ${id} encontrado no cache`);
      return JSON.parse(cached);
    }

    // Se não estiver no cache, busca do banco
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        bankingDetails: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    // Armazena no cache
    await this.redis.set(
      cacheKey,
      JSON.stringify(user),
      this.CACHE_TTL,
    );

    this.logger.debug(`Usuário ${id} armazenado no cache`);
    return user;
  }

  /**
   * Atualiza um usuário
   */
  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      include: {
        bankingDetails: true,
      },
    });

    // Invalida cache
    await this.redis.del(`user:${id}`);

    this.logger.log(`Usuário ${id} atualizado`);
    return user;
  }

  /**
   * Atualiza dados bancários de um usuário
   */
  async updateBankingDetails(
    userId: string,
    updateBankingDetailsDto: UpdateBankingDetailsDto,
  ) {
    // Verifica se usuário existe
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${userId} não encontrado`);
    }

    // Atualiza ou cria dados bancários
    const bankingDetails = await this.prisma.bankingDetails.upsert({
      where: { userId },
      update: {
        agency: updateBankingDetailsDto.agency,
        accountNumber: updateBankingDetailsDto.accountNumber,
      },
      create: {
        userId,
        agency: updateBankingDetailsDto.agency,
        accountNumber: updateBankingDetailsDto.accountNumber,
      },
    });

    // Invalida cache do usuário
    await this.redis.del(`user:${userId}`);

    this.logger.log(`Dados bancários do usuário ${userId} atualizados`);

    // TODO: Publicar evento no RabbitMQ no Card 9
    // await this.eventPublisher.publishBankingDetailsUpdated(...)

    return bankingDetails;
  }

  /**
   * Busca usuário por email
   */
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        bankingDetails: true,
      },
    });
  }
}
