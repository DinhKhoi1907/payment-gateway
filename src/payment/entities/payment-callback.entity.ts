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

interface CallbackPayload {
  [key: string]: unknown;
}

@Entity('payment_callbacks')
@Index(['payment_request_id'])
@Index(['status'])
@Index(['next_retry_at'])
@Index(['created_at'])
export class PaymentCallback {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  payment_request_id: number;

  @Column({ type: 'varchar', length: 500 })
  callback_url: string;

  @Column({ type: 'jsonb' })
  payload: CallbackPayload;

  @Column({ type: 'varchar', length: 500, nullable: true })
  signature: string;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: string;

  @Column({ type: 'int', nullable: true })
  response_status: number;

  @Column({ type: 'text', nullable: true })
  response_body: string;

  @Column({ type: 'int', default: 0 })
  retry_count: number;

  @Column({ type: 'int', default: 3 })
  max_retries: number;

  @Column({ type: 'timestamp', nullable: true })
  next_retry_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  sent_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => PaymentRequest, (paymentRequest) => paymentRequest.callbacks)
  @JoinColumn({ name: 'payment_request_id' })
  payment_request: PaymentRequest;

  isPending(): boolean {
    return this.status === 'pending';
  }

  isSent(): boolean {
    return this.status === 'sent';
  }

  isFailed(): boolean {
    return this.status === 'failed';
  }

  canRetry(): boolean {
    return this.retry_count < this.max_retries && this.status === 'failed';
  }

  markAsSent(responseStatus: number, responseBody: string): void {
    this.status = 'sent';
    this.response_status = responseStatus;
    this.response_body = responseBody;
    this.sent_at = new Date();
  }

  markAsFailed(): void {
    this.status = 'failed';
    this.retry_count += 1;
    this.next_retry_at = new Date(Date.now() + Math.pow(2, this.retry_count) * 60000); // Exponential backoff
  }

  scheduleRetry(): void {
    this.status = 'retrying';
    this.retry_count += 1;
    this.next_retry_at = new Date(Date.now() + Math.pow(2, this.retry_count) * 60000);
  }
}
