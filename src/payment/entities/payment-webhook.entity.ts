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

interface WebhookPayload {
  [key: string]: unknown;
}

@Entity('payment_webhooks')
@Index(['payment_request_id'])
@Index(['gateway_name'])
@Index(['webhook_id'])
@Index(['status'])
@Index(['created_at'])
export class PaymentWebhook {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  payment_request_id: number;

  @Column({ type: 'varchar', length: 50 })
  gateway_name: string;

  @Column({ type: 'varchar', length: 255 })
  webhook_id: string;

  @Column({ type: 'varchar', length: 100 })
  event_type: string;

  @Column({ type: 'jsonb' })
  payload: WebhookPayload;

  @Column({ type: 'varchar', length: 500, nullable: true })
  signature: string;

  @Column({ type: 'varchar', length: 50, default: 'received' })
  status: string;

  @Column({ type: 'timestamp', nullable: true })
  processed_at: Date;

  @Column({ type: 'text', nullable: true })
  error_message: string;

  @Column({ type: 'int', default: 0 })
  retry_count: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => PaymentRequest, (paymentRequest) => paymentRequest.webhooks)
  @JoinColumn({ name: 'payment_request_id' })
  payment_request: PaymentRequest;

  isProcessed(): boolean {
    return this.status === 'processed';
  }

  isFailed(): boolean {
    return this.status === 'failed';
  }

  canRetry(): boolean {
    return this.retry_count < 3 && this.status === 'failed';
  }

  markAsProcessed(): void {
    this.status = 'processed';
    this.processed_at = new Date();
  }

  markAsFailed(errorMessage: string): void {
    this.status = 'failed';
    this.error_message = errorMessage;
    this.retry_count += 1;
  }
}
