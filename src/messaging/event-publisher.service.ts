import { Injectable, Logger } from '@nestjs/common';
import { RabbitMQService } from './rabbitmq.service';
import { EventValidatorService } from './event-validator.service';
import { RABBITMQ_CONFIG } from './rabbitmq.config';
import {
  BankingDetailsUpdatedEvent,
  BaseEvent,
} from './interfaces/events.interface';
import { randomUUID } from 'crypto';

@Injectable()
export class EventPublisherService {
  private readonly logger = new Logger(EventPublisherService.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly eventValidator: EventValidatorService,
  ) {}

  /**
   * Publica evento de atualização de dados bancários
   */
  async publishBankingDetailsUpdated(
    userId: string,
    bankingDetails: { agency: string; account: string },
  ): Promise<void> {
    if (!this.rabbitMQService.isConnected()) {
      this.logger.warn('RabbitMQ não conectado. Evento não será publicado.');
      return;
    }

    const event: BankingDetailsUpdatedEvent & BaseEvent = {
      eventId: randomUUID(),
      userId,
      bankingDetails,
      timestamp: new Date().toISOString(),
      source: 'user-service',
    };

    if (!this.eventValidator.validateBankingDetailsUpdated(event)) {
      const error = new Error(
        'Evento banking-details.updated inválido. Não será publicado.',
      );
      this.logger.error(error.message, event);
      throw error;
    }

    try {
      await this.rabbitMQService.publishEvent(
        RABBITMQ_CONFIG.ROUTING_KEYS.BANKING_DETAILS_UPDATED,
        event,
      );
      this.logger.log(
        `Evento 'banking-details.updated' publicado para usuário ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        'Erro ao publicar evento banking-details.updated:',
        error,
      );
      throw error;
    }
  }
}
