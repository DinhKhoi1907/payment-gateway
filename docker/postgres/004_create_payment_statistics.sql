-- Payment statistics table for analytics and reporting
CREATE TABLE IF NOT EXISTS payment_statistics (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    gateway_name VARCHAR(50) NOT NULL, -- 'sepay', 'momo', 'paypal'
    total_requests INTEGER DEFAULT 0,
    successful_payments INTEGER DEFAULT 0,
    failed_payments INTEGER DEFAULT 0,
    cancelled_payments INTEGER DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    successful_amount DECIMAL(15,2) DEFAULT 0,
    average_processing_time INTEGER, -- in seconds
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, gateway_name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_statistics_date ON payment_statistics(date);
CREATE INDEX IF NOT EXISTS idx_payment_statistics_gateway_name ON payment_statistics(gateway_name);
CREATE INDEX IF NOT EXISTS idx_payment_statistics_created_at ON payment_statistics(created_at);
