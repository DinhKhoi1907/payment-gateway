import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentCallbacks1700000003000 implements MigrationInterface {
  name = 'CreatePaymentCallbacks1700000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payment_callbacks (
        id SERIAL PRIMARY KEY,
        payment_request_id INTEGER NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
        callback_url VARCHAR(500) NOT NULL,
        payload JSONB NOT NULL,
        signature VARCHAR(500),
        status VARCHAR(50) DEFAULT 'pending',
        response_status INTEGER,
        response_body TEXT,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        next_retry_at TIMESTAMP,
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_callbacks_payment_request_id ON payment_callbacks(payment_request_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_callbacks_status ON payment_callbacks(status)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_callbacks_next_retry_at ON payment_callbacks(next_retry_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_callbacks_created_at ON payment_callbacks(created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS payment_callbacks`);
  }
}
