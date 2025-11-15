import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('payment_statistics')
@Index(['date'])
@Index(['gateway_name'])
@Index(['created_at'])
@Unique(['date', 'gateway_name'])
export class PaymentStatistics {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'varchar', length: 50 })
  gateway_name: string;

  @Column({ type: 'int', default: 0 })
  total_requests: number;

  @Column({ type: 'int', default: 0 })
  successful_payments: number;

  @Column({ type: 'int', default: 0 })
  failed_payments: number;

  @Column({ type: 'int', default: 0 })
  cancelled_payments: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total_amount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  successful_amount: number;

  @Column({ type: 'int', nullable: true })
  average_processing_time: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  getSuccessRate(): number {
    if (this.total_requests === 0) return 0;
    return (this.successful_payments / this.total_requests) * 100;
  }

  getFailureRate(): number {
    if (this.total_requests === 0) return 0;
    return (this.failed_payments / this.total_requests) * 100;
  }

  getCancellationRate(): number {
    if (this.total_requests === 0) return 0;
    return (this.cancelled_payments / this.total_requests) * 100;
  }

  incrementTotalRequests(): void {
    this.total_requests += 1;
  }

  incrementSuccessfulPayments(amount: number): void {
    this.successful_payments += 1;
    this.successful_amount += amount;
  }

  incrementFailedPayments(): void {
    this.failed_payments += 1;
  }

  incrementCancelledPayments(): void {
    this.cancelled_payments += 1;
  }

  updateTotalAmount(amount: number): void {
    this.total_amount += amount;
  }

  updateAverageProcessingTime(processingTime: number): void {
    if (this.average_processing_time === null) {
      this.average_processing_time = processingTime;
    } else {
      this.average_processing_time = Math.round(
        (this.average_processing_time + processingTime) / 2
      );
    }
  }
}
