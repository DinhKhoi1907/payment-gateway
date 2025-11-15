import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentRequests1700000001000 implements MigrationInterface {
  name = 'CreatePaymentRequests1700000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payment_requests (
        id SERIAL PRIMARY KEY,
        idempotency_key VARCHAR(255) UNIQUE NOT NULL,
        session_id VARCHAR(255) UNIQUE,
        order_id VARCHAR(255) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'VND',
        status VARCHAR(50) DEFAULT 'pending',
        gateway_data JSONB,
        response_data JSONB,
        expires_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_requests_idempotency_key ON payment_requests(idempotency_key)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_requests_session_id ON payment_requests(session_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_requests_order_id ON payment_requests(order_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_requests_created_at ON payment_requests(created_at)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payment_logs (
        id SERIAL PRIMARY KEY,
        payment_request_id INTEGER NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        event_data JSONB,
        gateway_response JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_logs_payment_request_id ON payment_logs(payment_request_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_logs_event_type ON payment_logs(event_type)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_logs_created_at ON payment_logs(created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS payment_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS payment_requests`);
  }
}
