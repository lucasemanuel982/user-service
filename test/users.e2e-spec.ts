import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { EventPublisherService } from '../src/messaging/event-publisher.service';
import { AuthService } from '../src/auth/auth.service';

describe('UsersController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let eventPublisher: EventPublisherService;
  let authService: AuthService;

  let testUser: {
    id: string;
    email: string;
    name: string;
    password: string;
  };
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Aplicar ValidationPipe global
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    redis = moduleFixture.get<RedisService>(RedisService);
    eventPublisher = moduleFixture.get<EventPublisherService>(
      EventPublisherService,
    );
    authService = moduleFixture.get<AuthService>(AuthService);

    // Limpar dados de teste (com tratamento de erro)
    try {
      if (prisma) {
        await prisma.bankingDetails.deleteMany({});
        await prisma.user.deleteMany({});
      }
      if (redis) {
        await redis.del('user:*');
      }
    } catch (error) {
      console.warn('Erro ao limpar dados iniciais:', error);
      // Continua mesmo se houver erro na limpeza inicial
    }
  });

  afterAll(async () => {
    // Limpar dados de teste
    try {
      if (prisma) {
        await prisma.bankingDetails.deleteMany({});
        await prisma.user.deleteMany({});
        await prisma.$disconnect();
      }
      if (redis) {
        await redis.del('user:*');
      }
    } catch (error) {
      // Ignorar erros na limpeza
      console.warn('Erro na limpeza após testes:', error);
    }
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    // Criar usuário de teste e obter token
    testUser = {
      id: '',
      email: `test-${Date.now()}@example.com`,
      name: 'Test User',
      password: 'TestPassword123!',
    };

    const registerResult = await authService.register({
      name: testUser.name,
      email: testUser.email,
      password: testUser.password,
      address: 'Test Address',
    });

    testUser.id = registerResult.user.id;

    const loginResult = await authService.login({
      email: testUser.email,
      password: testUser.password,
    });

    accessToken = loginResult.accessToken;
  });

  afterEach(async () => {
    // Limpar dados após cada teste
    try {
      if (prisma) {
        await prisma.bankingDetails.deleteMany({});
        await prisma.user.deleteMany({});
      }
      if (redis) {
        await redis.del('user:*');
      }
    } catch (error) {
      // Ignorar erros na limpeza
      console.warn('Erro na limpeza após teste:', error);
    }
  });

  describe('GET /api/users/:id', () => {
    it('deve retornar usuário quando autenticado e autorizado', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', testUser.id);
      expect(response.body).toHaveProperty('email', testUser.email);
      expect(response.body).toHaveProperty('name', testUser.name);
    });

    it('deve retornar 403 quando usuário tenta acessar outro usuário', async () => {
      // Criar outro usuário
      const otherUser = await authService.register({
        name: 'Other User',
        email: `other-${Date.now()}@example.com`,
        password: 'OtherPassword123!',
        address: 'Other Address',
      });

      await request(app.getHttpServer())
        .get(`/api/users/${otherUser.user.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('deve retornar 401 quando não autenticado', async () => {
      await request(app.getHttpServer())
        .get(`/api/users/${testUser.id}`)
        .expect(401);
    });

    it('deve usar cache do Redis na segunda requisição', async () => {
      // Primeira requisição - deve buscar do banco
      const firstResponse = await request(app.getHttpServer())
        .get(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Verificar se foi armazenado no cache
      const cached = await redis.get(`user:${testUser.id}`);
      expect(cached).toBeTruthy();

      // Segunda requisição - deve usar cache
      const secondResponse = await request(app.getHttpServer())
        .get(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(secondResponse.body).toEqual(firstResponse.body);
    });

    it('deve retornar 403 quando usuário tenta acessar ID diferente do seu', async () => {
      // Usar um UUID válido mas que não corresponde ao usuário autenticado
      // O controller verifica autorização antes de verificar se o usuário existe
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';

      await request(app.getHttpServer())
        .get(`/api/users/${fakeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });
  });

  describe('PATCH /api/users/:id', () => {
    it('deve atualizar nome do usuário', async () => {
      const updateData = { name: 'Updated Name' };

      const response = await request(app.getHttpServer())
        .patch(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('name', 'Updated Name');
      expect(response.body).toHaveProperty('email', testUser.email);

      // Verificar no banco
      const user = await prisma.user.findUnique({
        where: { id: testUser.id },
      });
      expect(user?.name).toBe('Updated Name');
    });

    it('deve atualizar email do usuário', async () => {
      const newEmail = `updated-${Date.now()}@example.com`;
      const updateData = { email: newEmail };

      const response = await request(app.getHttpServer())
        .patch(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('email', newEmail);

      // Verificar no banco
      const user = (await prisma.user.findUnique({
        where: { id: testUser.id },
      })) as { email: string } | null;
      expect(user?.email).toBe(newEmail);
    });

    it('deve atualizar endereço do usuário', async () => {
      const updateData = { address: 'New Address' };

      const response = await request(app.getHttpServer())
        .patch(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('address', 'New Address');

      // Verificar no banco
      const user = await prisma.user.findUnique({
        where: { id: testUser.id },
      });
      expect(user?.address).toBe('New Address');
    });

    it('deve atualizar dados bancários e publicar evento no broker', async () => {
      const updateData = {
        bankingDetails: {
          agency: '0001',
          accountNumber: '123456',
        },
      };

      // Mock do método de publicação de evento
      const publishSpy = jest.spyOn(
        eventPublisher,
        'publishBankingDetailsUpdated',
      );

      const response = await request(app.getHttpServer())
        .patch(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(200);

      const body = response.body as {
        bankingDetails?: { agency: string; accountNumber: string };
      };
      expect(body.bankingDetails).toBeDefined();
      expect(body.bankingDetails?.agency).toBe('0001');
      expect(body.bankingDetails?.accountNumber).toBe('123456');

      // Verificar se evento foi publicado
      expect(publishSpy).toHaveBeenCalledWith(testUser.id, {
        agency: '0001',
        account: '123456',
      });

      publishSpy.mockRestore();
    });

    it('deve atualizar múltiplos campos simultaneamente', async () => {
      const updateData = {
        name: 'Updated Name',
        email: `updated-${Date.now()}@example.com`,
        address: 'Updated Address',
      };

      const response = await request(app.getHttpServer())
        .patch(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(200);

      const body = response.body as {
        name: string;
        email: string;
        address: string;
      };
      expect(body.name).toBe(updateData.name);
      expect(body.email).toBe(updateData.email);
      expect(body.address).toBe(updateData.address);
    });

    it('deve invalidar cache após atualização', async () => {
      // Primeiro, criar cache
      await request(app.getHttpServer())
        .get(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Verificar se cache existe
      const cachedBefore = await redis.get(`user:${testUser.id}`);
      expect(cachedBefore).toBeTruthy();

      // Atualizar usuário
      await request(app.getHttpServer())
        .patch(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      // Verificar se cache foi invalidado
      const cachedAfter = await redis.get(`user:${testUser.id}`);
      expect(cachedAfter).toBeNull();
    });

    it('deve retornar 403 quando usuário tenta atualizar outro usuário', async () => {
      const otherUser = await authService.register({
        name: 'Other User',
        email: `other-${Date.now()}@example.com`,
        password: 'OtherPassword123!',
        address: 'Other Address',
      });

      await request(app.getHttpServer())
        .patch(`/api/users/${otherUser.user.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Hacked Name' })
        .expect(403);
    });

    it('deve retornar 400 quando nenhum campo é fornecido', async () => {
      await request(app.getHttpServer())
        .patch(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);
    });
  });

  describe('PATCH /api/users/:id/profile-picture', () => {
    it('deve atualizar foto de perfil com arquivo válido', async () => {
      // Criar um buffer simulando uma imagem JPEG
      const imageBuffer = Buffer.from('fake-image-data');
      const filename = 'profile.jpg';

      const response = await request(app.getHttpServer())
        .patch(`/api/users/${testUser.id}/profile-picture`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', imageBuffer, filename)
        .expect(200);

      expect(response.body).toHaveProperty('id', testUser.id);
      const body = response.body as { profilePictureUrl: string };
      expect(body).toHaveProperty('profilePictureUrl');
      expect(body.profilePictureUrl).toContain('profile-pictures');
      expect(body.profilePictureUrl).toContain(testUser.id);

      // Verificar no banco
      const user = await prisma.user.findUnique({
        where: { id: testUser.id },
      });
      expect(user?.profilePictureUrl).toBeTruthy();
    });

    it('deve retornar 400 quando arquivo não é fornecido', async () => {
      await request(app.getHttpServer())
        .patch(`/api/users/${testUser.id}/profile-picture`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('deve retornar 400 quando tipo de arquivo não é permitido', async () => {
      const fileBuffer = Buffer.from('fake-pdf-data');
      const filename = 'document.pdf';

      await request(app.getHttpServer())
        .patch(`/api/users/${testUser.id}/profile-picture`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', fileBuffer, filename)
        .expect(400);
    });

    it('deve retornar 400 quando arquivo é muito grande', async () => {
      // Criar buffer de 6MB (maior que o limite de 5MB)
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024);
      const filename = 'large-image.jpg';

      await request(app.getHttpServer())
        .patch(`/api/users/${testUser.id}/profile-picture`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', largeBuffer, filename)
        .expect(400);
    });

    it('deve retornar 403 quando usuário tenta atualizar foto de outro usuário', async () => {
      const otherUser = await authService.register({
        name: 'Other User',
        email: `other-${Date.now()}@example.com`,
        password: 'OtherPassword123!',
        address: 'Other Address',
      });

      const imageBuffer = Buffer.from('fake-image-data');

      await request(app.getHttpServer())
        .patch(`/api/users/${otherUser.user.id}/profile-picture`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', imageBuffer, 'profile.jpg')
        .expect(403);
    });
  });

  describe('PATCH /api/users/:id/banking-details', () => {
    it('deve atualizar dados bancários', async () => {
      const bankingData = {
        agency: '0001',
        accountNumber: '123456',
      };

      const response = await request(app.getHttpServer())
        .patch(`/api/users/${testUser.id}/banking-details`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(bankingData)
        .expect(200);

      expect(response.body).toHaveProperty('agency', '0001');
      expect(response.body).toHaveProperty('accountNumber', '123456');

      // Verificar no banco
      const bankingDetails = await prisma.bankingDetails.findUnique({
        where: { userId: testUser.id },
      });
      expect(bankingDetails?.agency).toBe('0001');
      expect(bankingDetails?.accountNumber).toBe('123456');
    });

    it('deve criar dados bancários se não existirem', async () => {
      const bankingData = {
        agency: '0002',
        accountNumber: '543210',
      };

      const response = await request(app.getHttpServer())
        .patch(`/api/users/${testUser.id}/banking-details`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(bankingData)
        .expect(200);

      expect(response.body).toHaveProperty('agency', '0002');
      expect(response.body).toHaveProperty('accountNumber', '543210');
    });

    it('deve retornar 404 quando usuário não existe', async () => {
      // Usar um UUID válido mas que não existe no banco
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      const bankingData = {
        agency: '0001',
        accountNumber: '123456',
      };

      await request(app.getHttpServer())
        .patch(`/api/users/${fakeId}/banking-details`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(bankingData)
        .expect(404);
    });
  });

  describe('Integração com PostgreSQL', () => {
    it('deve persistir dados corretamente no PostgreSQL', async () => {
      const updateData = {
        name: 'PostgreSQL Test',
        email: `postgres-${Date.now()}@example.com`,
        address: 'PostgreSQL Address',
      };

      await request(app.getHttpServer())
        .patch(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(200);

      // Verificar diretamente no banco
      const user = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(user).toBeTruthy();
      expect(user?.name).toBe(updateData.name);
      expect(user?.email).toBe(updateData.email);
      expect(user?.address).toBe(updateData.address);
    });

    it('deve manter integridade referencial entre User e BankingDetails', async () => {
      const bankingData = {
        agency: '0001',
        accountNumber: '123456',
      };

      await request(app.getHttpServer())
        .patch(`/api/users/${testUser.id}/banking-details`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(bankingData)
        .expect(200);

      // Verificar relacionamento
      const user = await prisma.user.findUnique({
        where: { id: testUser.id },
        include: { bankingDetails: true },
      });

      const userWithBanking = user as {
        bankingDetails: { userId: string } | null;
      } | null;
      expect(userWithBanking?.bankingDetails).toBeTruthy();
      expect(userWithBanking?.bankingDetails?.userId).toBe(testUser.id);
    });
  });

  describe('Integração com Redis', () => {
    it('deve armazenar dados no cache Redis', async () => {
      // Fazer requisição para criar cache
      await request(app.getHttpServer())
        .get(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Verificar se está no cache
      const cached = await redis.get(`user:${testUser.id}`);
      expect(cached).toBeTruthy();

      const cachedUser = JSON.parse(cached as string) as {
        id: string;
        email: string;
      };
      expect(cachedUser.id).toBe(testUser.id);
      expect(cachedUser.email).toBe(testUser.email);
    });

    it('deve invalidar cache quando usuário é atualizado', async () => {
      // Criar cache
      await request(app.getHttpServer())
        .get(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Verificar cache existe
      let cached = await redis.get(`user:${testUser.id}`);
      expect(cached).toBeTruthy();

      // Atualizar usuário
      await request(app.getHttpServer())
        .patch(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Updated' })
        .expect(200);

      // Verificar cache foi invalidado
      cached = await redis.get(`user:${testUser.id}`);
      expect(cached).toBeNull();
    });
  });

  describe('Integração com RabbitMQ (Broker)', () => {
    it('deve publicar evento quando dados bancários são atualizados', async () => {
      const bankingData = {
        agency: '0001',
        accountNumber: '123456',
      };

      const publishSpy = jest.spyOn(
        eventPublisher,
        'publishBankingDetailsUpdated',
      );

      await request(app.getHttpServer())
        .patch(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ bankingDetails: bankingData })
        .expect(200);

      // Verificar se evento foi publicado
      expect(publishSpy).toHaveBeenCalledTimes(1);
      expect(publishSpy).toHaveBeenCalledWith(testUser.id, {
        agency: bankingData.agency,
        account: bankingData.accountNumber,
      });

      publishSpy.mockRestore();
    });

    it('não deve falhar quando RabbitMQ não está disponível', async () => {
      // Mock do método publishBankingDetailsUpdated para simular falha silenciosa
      const publishSpy = jest
        .spyOn(eventPublisher, 'publishBankingDetailsUpdated')
        .mockImplementation(() => {
          // Simula que o RabbitMQ não está disponível mas não lança erro
          return Promise.resolve();
        });

      const bankingData = {
        agency: '0002',
        accountNumber: '543210',
      };

      // A atualização deve funcionar mesmo sem RabbitMQ
      const response = await request(app.getHttpServer())
        .patch(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ bankingDetails: bankingData })
        .expect(200);

      const body = response.body as { bankingDetails?: unknown };
      expect(body.bankingDetails).toBeDefined();
      publishSpy.mockRestore();
    });
  });
});
