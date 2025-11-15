/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { PaymentRequest } from './payment-request.entity';

interface EventData {
  [key: string]: unknown;
}

interface GatewayResponse {
  [key: string]: unknown;
}

interface ErrorData {
  message?: string;
  code?: string;
  details?: unknown;
}

@Entity('payment_logs')
@Index(['payment_request_id'])
@Index(['event_type'])
@Index(['created_at'])
export class PaymentLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  payment_request_id: number;

  @Column({ type: 'varchar', length: 100 })
  event_type: string;

  @Column({ type: 'jsonb', nullable: true })
  event_data: EventData | null;

  @Column({ type: 'jsonb', nullable: true })
  gateway_response: GatewayResponse | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => PaymentRequest, (paymentRequest) => paymentRequest.logs)
  @JoinColumn({ name: 'payment_request_id' })
  payment_request: PaymentRequest;

  static createCreatedLog(
    paymentRequestId: number,
    eventData?: EventData,
  ): PaymentLog {
    const log = new PaymentLog();
    log.payment_request_id = paymentRequestId;
    log.event_type = 'created';
    log.event_data = eventData || null;
    return log;
  }

  static createInitiatedLog(
    paymentRequestId: number,
    gatewayResponse?: GatewayResponse,
  ): PaymentLog {
    const log = new PaymentLog();
    log.payment_request_id = paymentRequestId;
    log.event_type = 'initiated';
    log.gateway_response = gatewayResponse || null;
    return log;
  }

  static createWebhookReceivedLog(
    paymentRequestId: number,
    gatewayResponse: GatewayResponse,
  ): PaymentLog {
    const log = new PaymentLog();
    log.payment_request_id = paymentRequestId;
    log.event_type = 'webhook_received';
    log.gateway_response = gatewayResponse;
    return log;
  }

  static createCompletedLog(
    paymentRequestId: number,
    eventData?: EventData,
  ): PaymentLog {
    const log = new PaymentLog();
    log.payment_request_id = paymentRequestId;
    log.event_type = 'completed';
    log.event_data = eventData || null;
    return log;
  }

  static createFailedLog(
    paymentRequestId: number,
    reason: string,
    gatewayResponse?: GatewayResponse,
  ): PaymentLog {
    const log = new PaymentLog();
    log.payment_request_id = paymentRequestId;
    log.event_type = 'failed';
    log.event_data = { reason };
    log.gateway_response = gatewayResponse || null;
    return log;
  }

  static createIdempotentRequestLog(
    paymentRequestId: number,
    eventData?: EventData,
  ): PaymentLog {
    const log = new PaymentLog();
    log.payment_request_id = paymentRequestId;
    log.event_type = 'idempotent_request';
    log.event_data = eventData || null;
    return log;
  }

  static createDuplicateWebhookLog(
    paymentRequestId: number,
    eventData?: EventData,
  ): PaymentLog {
    const log = new PaymentLog();
    log.payment_request_id = paymentRequestId;
    log.event_type = 'duplicate_webhook';
    log.event_data = eventData || null;
    return log;
  }

  static createGatewayErrorLog(
    paymentRequestId: number,
    error: ErrorData | Error,
  ): PaymentLog {
    const log = new PaymentLog();
    log.payment_request_id = paymentRequestId;
    log.event_type = 'gateway_error';
    log.event_data = {
      error: error instanceof Error ? error.message : error.message || error,
    };
    log.gateway_response = error as GatewayResponse;
    return log;
  }

  static createWebhookVerificationFailedLog(
    paymentRequestId: number,
    eventData: EventData,
  ): PaymentLog {
    const log = new PaymentLog();
    log.payment_request_id = paymentRequestId;
    log.event_type = 'webhook_verification_failed';
    log.event_data = eventData;
    return log;
  }
}
