import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity({ name: 'payment_transactions' })
export class PaymentTransaction {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100 })
  gateway!: string;

  @Column({ type: 'timestamp', name: 'transaction_date' })
  transactionDate!: Date;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'account_number' })
  accountNumber?: string | null;

  @Column({ type: 'varchar', length: 250, nullable: true, name: 'sub_account' })
  subAccount?: string | null;

  @Column({ type: 'numeric', precision: 20, scale: 2, default: 0, name: 'amount_in' })
  amountIn!: string;

  @Column({ type: 'numeric', precision: 20, scale: 2, default: 0, name: 'amount_out' })
  amountOut!: string;

  @Column({ type: 'numeric', precision: 20, scale: 2, default: 0 })
  accumulated!: string;

  @Column({ type: 'varchar', length: 250, nullable: true })
  code?: string | null;

  @Column({ type: 'text', nullable: true, name: 'transaction_content' })
  transactionContent?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'reference_number' })
  referenceNumber?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  body?: Record<string, any> | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}


