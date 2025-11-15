-- Database initialization script for payment-services
-- This script will be executed when the PostgreSQL container starts for the first time

-- Create database if it doesn't exist
-- Note: The database name will be set via environment variables

-- Create a user for the application (optional)
-- CREATE USER payment_user WITH PASSWORD 'payment_password';

-- Grant privileges to the user
-- GRANT ALL PRIVILEGES ON DATABASE payment_db TO payment_user;

-- Run all migrations in order
\i /docker-entrypoint-initdb.d/001_create_payment_requests.sql
\i /docker-entrypoint-initdb.d/002_create_payment_webhooks.sql
\i /docker-entrypoint-initdb.d/003_create_payment_callbacks.sql
\i /docker-entrypoint-initdb.d/004_create_payment_statistics.sql
