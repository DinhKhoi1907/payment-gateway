/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { PaymentLog } from './payment-log.entity';
import { PaymentWebhook } from './payment-webhook.entity';
import { PaymentCallback } from './payment-callback.entity';

interface GatewayData {
  [key: string]: unknown;
}

interface ResponseData {
  [key: string]: unknown;
}

@Entity('payment_requests')
@Index(['idempotency_key'], { unique: true })
@Index(['session_id'], { unique: true })
@Index(['order_id'])
@Index(['status'])
@Index(['created_at'])
export class PaymentRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255, unique: true })
  idempotency_key: string;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  session_id: string;

  @Column({ type: 'varchar', length: 255 })
  order_id: string;

  @Column({ type: 'varchar', length: 50 })
  payment_method: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'VND' })
  currency: string;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: string;

  @Column({ type: 'jsonb', nullable: true })
  gateway_data: GatewayData | null;

  @Column({ type: 'jsonb', nullable: true })
  response_data: ResponseData | null;

  @Column({ type: 'timestamp', nullable: true })
  expires_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relationships
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  @OneToMany(() => PaymentLog, (log) => log.payment_request)
  logs: PaymentLog[];

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  @OneToMany(() => PaymentWebhook, (webhook) => webhook.payment_request)
  webhooks: PaymentWebhook[];

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  @OneToMany(() => PaymentCallback, (callback) => callback.payment_request)
  callbacks: PaymentCallback[];

  isExpired(): boolean {
    return this.expires_at && this.expires_at < new Date();
  }

  isCompleted(): boolean {
    return this.status === 'completed';
  }

  isFailed(): boolean {
    return this.status === 'failed';
  }

  isPending(): boolean {
    return this.status === 'pending';
  }

  markAsCompleted(
    gatewayTransactionId?: string,
    gatewayResponse?: GatewayData,
  ): void {
    this.status = 'completed';
    this.completed_at = new Date();
    if (gatewayTransactionId) {
      this.gateway_data = {
        ...this.gateway_data,
        transaction_id: gatewayTransactionId,
      };
    }
    if (gatewayResponse) {
      this.gateway_data = { ...this.gateway_data, response: gatewayResponse };
    }
  }

  markAsFailed(reason: string, gatewayResponse?: GatewayData): void {
    this.status = 'failed';
    this.gateway_data = {
      ...this.gateway_data,
      failure_reason: reason,
      response: gatewayResponse,
    };
  }

  markAsCancelled(reason: string = 'Payment cancelled'): void {
    this.status = 'cancelled';
    this.gateway_data = {
      ...this.gateway_data,
      cancellation_reason: reason,
    };
  }
}
