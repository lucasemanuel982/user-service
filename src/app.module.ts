import { Module } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MessagingModule } from './messaging/messaging.module';
import { EventPublisherService } from './messaging/event-publisher.service';
import { SecurityModule } from './security/security.module';

@Module({
  imports: [MessagingModule, SecurityModule],
  controllers: [AppController],
  providers: [
    AppService,
    EventPublisherService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
