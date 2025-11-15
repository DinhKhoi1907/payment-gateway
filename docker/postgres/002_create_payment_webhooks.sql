-- Payment webhooks table for tracking webhook deliveries
CREATE TABLE IF NOT EXISTS payment_webhooks (
    id SERIAL PRIMARY KEY,
    payment_request_id INTEGER REFERENCES payment_requests(id),
    gateway_name VARCHAR(50) NOT NULL, -- 'sepay', 'momo', 'paypal'
    webhook_id VARCHAR(255) NOT NULL, -- ID from gateway
    event_type VARCHAR(100) NOT NULL, -- 'payment.completed', 'payment.failed', etc.
    payload JSONB NOT NULL,
    signature VARCHAR(500), -- Webhook signature
    status VARCHAR(50) DEFAULT 'received', -- 'received', 'processed', 'failed'
    processed_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_payment_request_id ON payment_webhooks(payment_request_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_gateway_name ON payment_webhooks(gateway_name);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_webhook_id ON payment_webhooks(webhook_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_status ON payment_webhooks(status);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_created_at ON payment_webhooks(created_at);
