import { Injectable, Logger } from '@nestjs/common';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';
import { BankingDetailsUpdatedEvent } from './interfaces/events.interface';

@Injectable()
export class EventValidatorService {
  private readonly logger = new Logger(EventValidatorService.name);
  private readonly ajv: Ajv;
  private readonly bankingDetailsUpdatedValidator: ValidateFunction;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);

    const schemasPath = path.join(
      __dirname,
      '../../src/schemas/event-schemas.json',
    );
    const eventSchemas = JSON.parse(fs.readFileSync(schemasPath, 'utf-8')) as {
      definitions: {
        BankingDetailsUpdatedEvent: Record<string, unknown>;
      };
    };

    this.bankingDetailsUpdatedValidator = this.ajv.compile(
      eventSchemas.definitions.BankingDetailsUpdatedEvent as never,
    );
  }

  /**
   * Valida evento de atualização de dados bancários
   */
  validateBankingDetailsUpdated(
    event: unknown,
  ): event is BankingDetailsUpdatedEvent {
    const valid = this.bankingDetailsUpdatedValidator(event);
    if (!valid) {
      this.logger.error(
        'Evento banking-details.updated inválido:',
        this.bankingDetailsUpdatedValidator.errors,
      );
    }
    return valid;
  }
}
