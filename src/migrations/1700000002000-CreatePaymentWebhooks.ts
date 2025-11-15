import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentWebhooks1700000002000 implements MigrationInterface {
  name = 'CreatePaymentWebhooks1700000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payment_webhooks (
        id SERIAL PRIMARY KEY,
        payment_request_id INTEGER NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
        gateway_name VARCHAR(50) NOT NULL,
        webhook_id VARCHAR(255) NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        signature VARCHAR(500),
        status VARCHAR(50) DEFAULT 'received',
        processed_at TIMESTAMP,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_webhooks_payment_request_id ON payment_webhooks(payment_request_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_webhooks_gateway_name ON payment_webhooks(gateway_name)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_webhooks_webhook_id ON payment_webhooks(webhook_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_webhooks_status ON payment_webhooks(status)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_webhooks_created_at ON payment_webhooks(created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS payment_webhooks`);
  }
}
