import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';
import Redis from 'ioredis';

// Mock do ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    return {
      on: jest.fn(),
      ping: jest.fn(),
      quit: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      expire: jest.fn(),
      ttl: jest.fn(),
    };
  });
});

describe('RedisService', () => {
  let service: RedisService;
  let mockRedisClient: jest.Mocked<Redis>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RedisService],
    }).compile();

    service = module.get<RedisService>(RedisService);
    mockRedisClient = service.getClient() as jest.Mocked<Redis>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('deve verificar conexão Redis ao inicializar', async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');

      await service.onModuleInit();

      expect(mockRedisClient.ping).toHaveBeenCalled();
    });

    it('deve lidar com erro ao verificar conexão', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('Connection failed'));

      await expect(service.onModuleInit()).resolves.not.toThrow();
    });
  });

  describe('onModuleDestroy', () => {
    it('deve desconectar do Redis ao destruir módulo', async () => {
      mockRedisClient.quit.mockResolvedValue('OK');

      await service.onModuleDestroy();

      expect(mockRedisClient.quit).toHaveBeenCalled();
    });
  });

  describe('getClient', () => {
    it('deve retornar o cliente Redis', () => {
      const client = service.getClient();

      expect(client).toBeDefined();
      expect(client).toBe(mockRedisClient);
    });
  });

  describe('get', () => {
    it('deve obter valor de uma chave', async () => {
      const key = 'test-key';
      const value = 'test-value';

      mockRedisClient.get.mockResolvedValue(value);

      const result = await service.get(key);

      expect(result).toBe(value);
      expect(mockRedisClient.get).toHaveBeenCalledWith(key);
    });

    it('deve retornar null quando chave não existe', async () => {
      const key = 'non-existent-key';

      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.get(key);

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('deve definir valor sem TTL', async () => {
      const key = 'test-key';
      const value = 'test-value';

      mockRedisClient.set.mockResolvedValue('OK');

      const result = await service.set(key, value);

      expect(result).toBe('OK');
      expect(mockRedisClient.set).toHaveBeenCalledWith(key, value);
      expect(mockRedisClient.setex).not.toHaveBeenCalled();
    });

    it('deve definir valor com TTL', async () => {
      const key = 'test-key';
      const value = 'test-value';
      const ttl = 3600;

      mockRedisClient.setex.mockResolvedValue('OK');

      const result = await service.set(key, value, ttl);

      expect(result).toBe('OK');
      expect(mockRedisClient.setex).toHaveBeenCalledWith(key, ttl, value);
      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });
  });

  describe('del', () => {
    it('deve deletar uma chave', async () => {
      const key = 'test-key';

      mockRedisClient.del.mockResolvedValue(1);

      const result = await service.del(key);

      expect(result).toBe(1);
      expect(mockRedisClient.del).toHaveBeenCalledWith(key);
    });

    it('deve deletar múltiplas chaves', async () => {
      const keys = ['key1', 'key2', 'key3'];

      mockRedisClient.del.mockResolvedValue(3);

      const result = await service.del(...keys);

      expect(result).toBe(3);
      expect(mockRedisClient.del).toHaveBeenCalledWith(...keys);
    });

    it('deve retornar 0 quando chave não existe', async () => {
      const key = 'non-existent-key';

      mockRedisClient.del.mockResolvedValue(0);

      const result = await service.del(key);

      expect(result).toBe(0);
    });
  });

  describe('exists', () => {
    it('deve retornar 1 quando chave existe', async () => {
      const key = 'test-key';

      mockRedisClient.exists.mockResolvedValue(1);

      const result = await service.exists(key);

      expect(result).toBe(1);
      expect(mockRedisClient.exists).toHaveBeenCalledWith(key);
    });

    it('deve retornar 0 quando chave não existe', async () => {
      const key = 'non-existent-key';

      mockRedisClient.exists.mockResolvedValue(0);

      const result = await service.exists(key);

      expect(result).toBe(0);
    });
  });

  describe('expire', () => {
    it('deve definir TTL para uma chave', async () => {
      const key = 'test-key';
      const seconds = 3600;

      mockRedisClient.expire.mockResolvedValue(1);

      const result = await service.expire(key, seconds);

      expect(result).toBe(1);
      expect(mockRedisClient.expire).toHaveBeenCalledWith(key, seconds);
    });

    it('deve retornar 0 quando chave não existe', async () => {
      const key = 'non-existent-key';
      const seconds = 3600;

      mockRedisClient.expire.mockResolvedValue(0);

      const result = await service.expire(key, seconds);

      expect(result).toBe(0);
    });
  });

  describe('ttl', () => {
    it('deve retornar TTL restante de uma chave', async () => {
      const key = 'test-key';
      const ttl = 3600;

      mockRedisClient.ttl.mockResolvedValue(ttl);

      const result = await service.ttl(key);

      expect(result).toBe(ttl);
      expect(mockRedisClient.ttl).toHaveBeenCalledWith(key);
    });

    it('deve retornar -1 quando chave não tem TTL', async () => {
      const key = 'test-key';

      mockRedisClient.ttl.mockResolvedValue(-1);

      const result = await service.ttl(key);

      expect(result).toBe(-1);
    });

    it('deve retornar -2 quando chave não existe', async () => {
      const key = 'non-existent-key';

      mockRedisClient.ttl.mockResolvedValue(-2);

      const result = await service.ttl(key);

      expect(result).toBe(-2);
    });
  });
});
