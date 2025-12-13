import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateBankingDetailsDto } from './dto/update-banking-details.dto';
import { EventPublisherService } from '../messaging/event-publisher.service';

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
    private readonly eventPublisher: EventPublisherService,
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
   * Atualiza um usuário parcialmente
   * Valida campos permitidos: name, email, address, bankingDetails
   * Publica evento no broker quando dados bancários forem atualizados
   */
  async update(id: string, updateUserDto: UpdateUserDto) {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new BadRequestException('ID do usuário é obrigatório');
    }

    // Validar que pelo menos um campo foi fornecido
    const hasUserFields =
      updateUserDto.name !== undefined ||
      updateUserDto.email !== undefined ||
      updateUserDto.address !== undefined;
    const hasBankingDetails = updateUserDto.bankingDetails !== undefined;

    if (!hasUserFields && !hasBankingDetails) {
      throw new BadRequestException(
        'Pelo menos um campo deve ser fornecido para atualização',
      );
    }

    try {
      // Verificar se o usuário existe
      const existingUser = await this.prisma.user.findUnique({
        where: { id },
        include: { bankingDetails: true },
      });

      if (!existingUser) {
        throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
      }

      // Preparar dados de atualização do usuário (sem bankingDetails)
      const userUpdateData: {
        name?: string;
        email?: string;
        address?: string;
      } = {};

      if (updateUserDto.name !== undefined) {
        userUpdateData.name = updateUserDto.name;
      }
      if (updateUserDto.email !== undefined) {
        userUpdateData.email = updateUserDto.email;
      }
      if (updateUserDto.address !== undefined) {
        userUpdateData.address = updateUserDto.address;
      }

      // Atualizar dados do usuário se houver campos para atualizar
      if (Object.keys(userUpdateData).length > 0) {
        await this.prisma.user.update({
          where: { id },
          data: userUpdateData,
          include: { bankingDetails: true },
        });
      }

      // Atualizar dados bancários se fornecidos
      let bankingDetailsUpdated = false;
      if (hasBankingDetails && updateUserDto.bankingDetails) {
        const bankingDetails =
          updateUserDto.bankingDetails as UpdateBankingDetailsDto;
        await this.prisma.bankingDetails.upsert({
          where: { userId: id },
          update: {
            agency: bankingDetails.agency,
            accountNumber: bankingDetails.accountNumber,
          },
          create: {
            userId: id,
            agency: bankingDetails.agency,
            accountNumber: bankingDetails.accountNumber,
          },
        });

        bankingDetailsUpdated = true;

        // Publicar evento no broker quando dados bancários forem atualizados
        try {
          await this.eventPublisher.publishBankingDetailsUpdated(id, {
            agency: bankingDetails.agency,
            account: bankingDetails.accountNumber,
          });
          this.logger.log(
            `Evento de atualização de dados bancários publicado para usuário ${id}`,
          );
        } catch (eventError: unknown) {
          // Log do erro mas não falha a atualização se o evento falhar
          const errorMessage =
            eventError instanceof Error
              ? eventError.message
              : 'Erro desconhecido';
          this.logger.error(
            `Erro ao publicar evento de atualização de dados bancários para usuário ${id}: ${errorMessage}`,
          );
        }
      }

      // Buscar usuário atualizado com bankingDetails
      const userWithBanking = await this.prisma.user.findUnique({
        where: { id },
        include: { bankingDetails: true },
      });

      // Invalidar cache
      try {
        await this.redis.del(`user:${id}`);
        this.logger.debug(`Cache do usuário ${id} invalidado`);
      } catch (cacheError: unknown) {
        // Log do erro mas não falha a requisição se o cache falhar
        const errorMessage =
          cacheError instanceof Error
            ? cacheError.message
            : 'Erro desconhecido';
        this.logger.warn(
          `Erro ao invalidar cache do usuário ${id}: ${errorMessage}`,
        );
      }

      this.logger.log(
        `Usuário ${id} atualizado${bankingDetailsUpdated ? ' (incluindo dados bancários)' : ''}`,
      );

      return userWithBanking;
    } catch (error: unknown) {
      // Se já for uma exceção do NestJS, re-lança
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      // Log de erros inesperados
      const errorMessage =
        error instanceof Error ? error.message : 'Erro desconhecido';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Erro ao atualizar usuário ${id}: ${errorMessage}`,
        errorStack,
      );

      // Lança exceção genérica para erros inesperados
      throw new InternalServerErrorException(
        'Erro ao atualizar usuário. Tente novamente mais tarde.',
      );
    }
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
