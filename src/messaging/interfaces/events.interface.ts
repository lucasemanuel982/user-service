/**
 * Interfaces para eventos de mensageria
 */

export interface BankingDetailsUpdatedEvent {
  userId: string;
  bankingDetails: {
    agency: string;
    account: string;
  };
  timestamp: string;
}

export interface BaseEvent {
  eventId: string;
  timestamp: string;
  source: string;
}
