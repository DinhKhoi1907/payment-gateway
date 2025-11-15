FROM postgres:15-alpine

# Copy initialization script and migrations
COPY init.sql /docker-entrypoint-initdb.d/
COPY 001_create_payment_requests.sql /docker-entrypoint-initdb.d/
COPY 002_create_payment_webhooks.sql /docker-entrypoint-initdb.d/
COPY 003_create_payment_callbacks.sql /docker-entrypoint-initdb.d/
COPY 004_create_payment_statistics.sql /docker-entrypoint-initdb.d/

# Set environment variables (will be overridden by docker-compose)
ENV POSTGRES_DB=payment_db
ENV POSTGRES_USER=postgres
ENV POSTGRES_PASSWORD=postgres

# Expose PostgreSQL port
EXPOSE 5432

# The postgres image will automatically run init.sql on first startup
