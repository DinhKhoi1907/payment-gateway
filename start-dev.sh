#!/bin/bash

echo "🚀 Starting Payment Service Development Environment..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env from env.example..."
    cp env.example .env
    echo "⚠️  Please update .env with your actual configuration values"
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if database is running
echo "🔍 Checking database connection..."
if ! pg_isready -h localhost -p 5432 -U postgres > /dev/null 2>&1; then
    echo "❌ PostgreSQL is not running. Please start PostgreSQL first."
    echo "   You can use Docker: docker-compose up -d postgres"
    exit 1
fi

# Run migrations
echo "🗄️  Running database migrations..."
npm run migration:run

# Start the service
echo "🎯 Starting Payment Service..."
npm run start:dev
