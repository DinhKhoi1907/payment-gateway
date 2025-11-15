-- Payment callbacks table for tracking callbacks to Laravel
CREATE TABLE IF NOT EXISTS payment_callbacks (
    id SERIAL PRIMARY KEY,
    payment_request_id INTEGER REFERENCES payment_requests(id),
    callback_url VARCHAR(500) NOT NULL,
    payload JSONB NOT NULL,
    signature VARCHAR(500), -- HMAC signature for security
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'retrying'
    response_status INTEGER, -- HTTP status code from Laravel
    response_body TEXT, -- Response body from Laravel
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMP,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_callbacks_payment_request_id ON payment_callbacks(payment_request_id);
CREATE INDEX IF NOT EXISTS idx_payment_callbacks_status ON payment_callbacks(status);
CREATE INDEX IF NOT EXISTS idx_payment_callbacks_next_retry_at ON payment_callbacks(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_payment_callbacks_created_at ON payment_callbacks(created_at);
