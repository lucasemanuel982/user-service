import { Module, Global } from '@nestjs/common';
import { RabbitMQService } from './rabbitmq.service';
import { EventPublisherService } from './event-publisher.service';
import { EventValidatorService } from './event-validator.service';

@Global()
@Module({
  providers: [RabbitMQService, EventPublisherService, EventValidatorService],
  exports: [RabbitMQService, EventPublisherService, EventValidatorService],
})
export class MessagingModule {}
