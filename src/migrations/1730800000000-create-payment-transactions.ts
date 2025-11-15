import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentTransactions1730800000000 implements MigrationInterface {
  name = 'CreatePaymentTransactions1730800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_transactions" (
        "id" SERIAL PRIMARY KEY,
        "gateway" varchar(100) NOT NULL,
        "transaction_date" timestamp NOT NULL,
        "account_number" varchar(100),
        "sub_account" varchar(250),
        "amount_in" numeric(20,2) NOT NULL DEFAULT 0,
        "amount_out" numeric(20,2) NOT NULL DEFAULT 0,
        "accumulated" numeric(20,2) NOT NULL DEFAULT 0,
        "code" varchar(250),
        "transaction_content" text,
        "reference_number" varchar(255),
        "body" jsonb,
        "created_at" timestamp NOT NULL DEFAULT now()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_transactions";`);
  }
}


