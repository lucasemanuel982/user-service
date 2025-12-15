import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor() {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);

    this.client = new Redis({
      host,
      port,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => {
      this.logger.log('Conectando ao Redis...');
    });

    this.client.on('ready', () => {
      this.logger.log('Conectado ao Redis com sucesso');
    });

    this.client.on('error', (error) => {
      this.logger.error('Erro no Redis:', error);
    });

    this.client.on('close', () => {
      this.logger.warn('Conexão Redis fechada');
    });
  }

  async onModuleInit() {
    // Conexão é estabelecida automaticamente pelo ioredis
    try {
      await this.client.ping();
      this.logger.log('Redis está pronto');
    } catch (error) {
      this.logger.error('Erro ao verificar conexão Redis:', error);
    }
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log('Desconectado do Redis');
  }

  /**
   * Obtém o cliente Redis
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * GET - Obtém valor de uma chave
   */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * SET - Define valor de uma chave
   */
  async set(key: string, value: string, ttl?: number): Promise<'OK'> {
    if (ttl) {
      return this.client.setex(key, ttl, value);
    }
    return this.client.set(key, value);
  }

  /**
   * DEL - Remove uma ou mais chaves
   */
  async del(...keys: string[]): Promise<number> {
    return this.client.del(...keys);
  }

  /**
   * EXISTS - Verifica se uma chave existe
   */
  async exists(key: string): Promise<number> {
    return this.client.exists(key);
  }

  /**
   * EXPIRE - Define TTL para uma chave
   */
  async expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  /**
   * TTL - Obtém TTL restante de uma chave
   */
  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }
}
