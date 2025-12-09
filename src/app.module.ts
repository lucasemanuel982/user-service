import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MessagingModule } from './messaging/messaging.module';
import { EventPublisherService } from './messaging/event-publisher.service';

@Module({
  imports: [MessagingModule],
  controllers: [AppController],
  providers: [AppService, EventPublisherService],
})
export class AppModule {}
