import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentStatistics1700000004000 implements MigrationInterface {
  name = 'CreatePaymentStatistics1700000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payment_statistics (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        gateway_name VARCHAR(50) NOT NULL,
        total_requests INTEGER DEFAULT 0,
        successful_payments INTEGER DEFAULT 0,
        failed_payments INTEGER DEFAULT 0,
        cancelled_payments INTEGER DEFAULT 0,
        total_amount DECIMAL(15,2) DEFAULT 0,
        successful_amount DECIMAL(15,2) DEFAULT 0,
        average_processing_time INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, gateway_name)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_statistics_date ON payment_statistics(date)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_statistics_gateway_name ON payment_statistics(gateway_name)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_statistics_created_at ON payment_statistics(created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS payment_statistics`);
  }
}
