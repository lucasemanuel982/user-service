import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
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
   * Busca um usuário por ID
   * Implementa cache Redis para otimização
   */
  async findOne(id: string) {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new NotFoundException('ID do usuário é obrigatório');
    }

    const cacheKey = `user:${id}`;

    try {
      // Tentar buscar do cache primeiro
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        this.logger.debug(`Usuário ${id} encontrado no cache`);
        try {
          return JSON.parse(cached) as unknown;
        } catch {
          this.logger.warn(
            `Erro ao fazer parse do cache para usuário ${id}, buscando do banco`,
          );
          // Se houver erro no parse, continua para buscar do banco
        }
      }

      // Buscar do banco de dados
      const user = await this.prisma.user.findUnique({
        where: { id },
        include: {
          bankingDetails: true,
        },
      });

      if (!user) {
        throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
      }

      // Armazenar no cache
      try {
        await this.redis.set(cacheKey, JSON.stringify(user), this.CACHE_TTL);
        this.logger.debug(`Usuário ${id} armazenado no cache`);
      } catch (cacheError: unknown) {
        // Log do erro mas não falha a requisição se o cache falhar
        const errorMessage =
          cacheError instanceof Error
            ? cacheError.message
            : 'Erro desconhecido';
        this.logger.warn(
          `Erro ao armazenar usuário ${id} no cache: ${errorMessage}`,
        );
      }

      return user;
    } catch (error: unknown) {
      // Se já for uma exceção do NestJS, re-lança
      if (error instanceof NotFoundException) {
        throw error;
      }

      // Log de erros inesperados
      const errorMessage =
        error instanceof Error ? error.message : 'Erro desconhecido';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Erro ao buscar usuário ${id}: ${errorMessage}`,
        errorStack,
      );

      // Lança exceção genérica para erros inesperados
      throw new InternalServerErrorException(
        'Erro ao buscar usuário. Tente novamente mais tarde.',
      );
    }
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${userId} não encontrado`);
    }

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

    await this.redis.del(`user:${userId}`);

    this.logger.log(`Dados bancários do usuário ${userId} atualizados`);

    // TODO: Publicar evento no RabbitMQ
    // await this.eventPublisher.publishBankingDetailsUpdated(...)

    return bankingDetails;
  }

  /**
   * Busca usuário por email
   */
  async findByEmail(email: string) {
    return await this.prisma.user.findUnique({
      where: { email },
      include: {
        bankingDetails: true,
      },
    });
  }
}
