# NestJS Payment Database Schema

## Tables Overview

### 1. `payment_requests` table
- **Purpose**: Store payment requests with idempotency
- **Key Fields**:
  - `idempotency_key` (String, Unique): Prevents duplicate requests
  - `order_id` (String): Laravel order ID
  - `payment_method` (String): 'sepay', 'momo', 'paypal'
  - `amount` (Decimal): Payment amount
  - `status` (String): 'pending', 'completed', 'failed', 'cancelled'
  - `gateway_data` (JSONB): Gateway-specific data
  - `response_data` (JSONB): Payment gateway response
  - `expires_at` (Timestamp): Request expiration time

### 2. `payment_logs` table
- **Purpose**: Audit trail for all payment events
- **Key Fields**:
  - `payment_request_id` (FK): Reference to payment_requests
  - `event_type` (String): Event type (created, initiated, completed, etc.)
  - `event_data` (JSONB): Additional event data
  - `gateway_response` (JSONB): Gateway response data

### 3. `payment_webhooks` table
- **Purpose**: Track webhook deliveries from payment gateways
- **Key Fields**:
  - `payment_request_id` (FK): Reference to payment_requests
  - `gateway_name` (String): Gateway name (sepay, momo, paypal)
  - `webhook_id` (String): Gateway's webhook ID
  - `event_type` (String): Webhook event type
  - `payload` (JSONB): Webhook payload
  - `signature` (String): Webhook signature for verification
  - `status` (String): Processing status
  - `retry_count` (Integer): Number of retry attempts

### 4. `payment_callbacks` table
- **Purpose**: Track callbacks to Laravel
- **Key Fields**:
  - `payment_request_id` (FK): Reference to payment_requests
  - `callback_url` (String): Laravel callback URL
  - `payload` (JSONB): Callback payload
  - `signature` (String): HMAC signature for security
  - `status` (String): Callback status
  - `response_status` (Integer): HTTP status from Laravel
  - `retry_count` (Integer): Number of retry attempts

### 5. `payment_statistics` table
- **Purpose**: Daily statistics and analytics
- **Key Fields**:
  - `date` (Date): Statistics date
  - `gateway_name` (String): Gateway name
  - `total_requests` (Integer): Total payment requests
  - `successful_payments` (Integer): Successful payments
  - `failed_payments` (Integer): Failed payments
  - `total_amount` (Decimal): Total amount processed
  - `successful_amount` (Decimal): Successful amount
  - `average_processing_time` (Integer): Average processing time in seconds

## Relationships

```
PaymentRequest (1) -----> (N) PaymentLog
PaymentRequest (1) -----> (N) PaymentWebhook
PaymentRequest (1) -----> (N) PaymentCallback
```

## Indexes

- `payment_requests`: idempotency_key (unique), order_id, status, created_at
- `payment_logs`: payment_request_id, event_type, created_at
- `payment_webhooks`: payment_request_id, gateway_name, webhook_id, status, created_at
- `payment_callbacks`: payment_request_id, status, next_retry_at, created_at
- `payment_statistics`: date, gateway_name, created_at

## Entities

- `PaymentRequest`: Main payment request entity
- `PaymentLog`: Audit trail entity
- `PaymentWebhook`: Webhook tracking entity
- `PaymentCallback`: Callback tracking entity
- `PaymentStatistics`: Statistics entity

## Features

- **Idempotency**: Prevents duplicate payment requests
- **Audit Trail**: Complete event logging
- **Webhook Tracking**: Monitor gateway webhooks
- **Callback Management**: Track Laravel callbacks with retry logic
- **Statistics**: Daily analytics and reporting
- **JSONB Support**: Flexible JSON data storage
- **Performance**: Optimized indexes for fast queries
