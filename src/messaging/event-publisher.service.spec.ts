import { Test, TestingModule } from '@nestjs/testing';
import { EventPublisherService } from './event-publisher.service';
import { RabbitMQService } from './rabbitmq.service';
import { EventValidatorService } from './event-validator.service';
import { RABBITMQ_CONFIG } from './rabbitmq.config';

describe('EventPublisherService', () => {
  let service: EventPublisherService;
  let rabbitMQService: RabbitMQService;
  let eventValidator: EventValidatorService;

  const mockRabbitMQService = {
    isConnected: jest.fn(),
    publishEvent: jest.fn(),
  };

  const mockEventValidator = {
    validateBankingDetailsUpdated: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventPublisherService,
        {
          provide: RabbitMQService,
          useValue: mockRabbitMQService,
        },
        {
          provide: EventValidatorService,
          useValue: mockEventValidator,
        },
      ],
    }).compile();

    service = module.get<EventPublisherService>(EventPublisherService);
    rabbitMQService = module.get<RabbitMQService>(RabbitMQService);
    eventValidator = module.get<EventValidatorService>(EventValidatorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('publishBankingDetailsUpdated', () => {
    const userId = 'user-123';
    const bankingDetails = {
      agency: '0001',
      account: '12345-6',
    };

    it('deve publicar evento quando RabbitMQ está conectado', async () => {
      mockRabbitMQService.isConnected.mockReturnValue(true);
      mockEventValidator.validateBankingDetailsUpdated.mockReturnValue(true);
      mockRabbitMQService.publishEvent.mockResolvedValue(undefined);

      await service.publishBankingDetailsUpdated(userId, bankingDetails);

      expect(mockRabbitMQService.isConnected).toHaveBeenCalled();
      expect(mockEventValidator.validateBankingDetailsUpdated).toHaveBeenCalled();
      expect(mockRabbitMQService.publishEvent).toHaveBeenCalledWith(
        RABBITMQ_CONFIG.ROUTING_KEYS.BANKING_DETAILS_UPDATED,
        expect.objectContaining({
          userId,
          bankingDetails,
          timestamp: expect.any(String),
          source: 'user-service',
          eventId: expect.any(String),
        }),
      );
    });

    it('não deve publicar evento quando RabbitMQ não está conectado', async () => {
      mockRabbitMQService.isConnected.mockReturnValue(false);

      await service.publishBankingDetailsUpdated(userId, bankingDetails);

      expect(mockRabbitMQService.isConnected).toHaveBeenCalled();
      expect(mockEventValidator.validateBankingDetailsUpdated).not.toHaveBeenCalled();
      expect(mockRabbitMQService.publishEvent).not.toHaveBeenCalled();
    });

    it('deve lançar erro quando evento é inválido', async () => {
      mockRabbitMQService.isConnected.mockReturnValue(true);
      mockEventValidator.validateBankingDetailsUpdated.mockReturnValue(false);

      await expect(
        service.publishBankingDetailsUpdated(userId, bankingDetails),
      ).rejects.toThrow('Evento banking-details.updated inválido');

      expect(mockRabbitMQService.publishEvent).not.toHaveBeenCalled();
    });

    it('deve lançar erro quando publicação falha', async () => {
      const error = new Error('Falha ao publicar');
      mockRabbitMQService.isConnected.mockReturnValue(true);
      mockEventValidator.validateBankingDetailsUpdated.mockReturnValue(true);
      mockRabbitMQService.publishEvent.mockRejectedValue(error);

      await expect(
        service.publishBankingDetailsUpdated(userId, bankingDetails),
      ).rejects.toThrow(error);

      expect(mockRabbitMQService.publishEvent).toHaveBeenCalled();
    });

    it('deve incluir eventId único no evento', async () => {
      mockRabbitMQService.isConnected.mockReturnValue(true);
      mockEventValidator.validateBankingDetailsUpdated.mockReturnValue(true);
      mockRabbitMQService.publishEvent.mockResolvedValue(undefined);

      await service.publishBankingDetailsUpdated(userId, bankingDetails);

      const publishCall = mockRabbitMQService.publishEvent.mock.calls[0];
      const event = publishCall[1] as { eventId: string };

      expect(event.eventId).toBeDefined();
      expect(typeof event.eventId).toBe('string');
      expect(event.eventId.length).toBeGreaterThan(0);
    });

    it('deve incluir timestamp no formato ISO no evento', async () => {
      mockRabbitMQService.isConnected.mockReturnValue(true);
      mockEventValidator.validateBankingDetailsUpdated.mockReturnValue(true);
      mockRabbitMQService.publishEvent.mockResolvedValue(undefined);

      await service.publishBankingDetailsUpdated(userId, bankingDetails);

      const publishCall = mockRabbitMQService.publishEvent.mock.calls[0];
      const event = publishCall[1] as { timestamp: string };

      expect(event.timestamp).toBeDefined();
      expect(() => new Date(event.timestamp)).not.toThrow();
      expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
    });

    it('deve incluir source correto no evento', async () => {
      mockRabbitMQService.isConnected.mockReturnValue(true);
      mockEventValidator.validateBankingDetailsUpdated.mockReturnValue(true);
      mockRabbitMQService.publishEvent.mockResolvedValue(undefined);

      await service.publishBankingDetailsUpdated(userId, bankingDetails);

      const publishCall = mockRabbitMQService.publishEvent.mock.calls[0];
      const event = publishCall[1] as { source: string };

      expect(event.source).toBe('user-service');
    });
  });
});
