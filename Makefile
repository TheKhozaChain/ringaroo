.PHONY: dev up down clean install test build

# Default target
dev: up
	@echo "🚀 Ringaroo development environment started!"
	@echo "📞 Server: http://localhost:3000"
	@echo "💻 Dashboard: http://localhost:5173"
	@echo "🔗 Supabase Studio: http://localhost:54323"
	@echo "📊 Redis Commander: http://localhost:8081"

# Start all services
up:
	@echo "🔧 Starting Ringaroo development stack..."
	docker-compose up -d
	@echo "⏳ Waiting for services to be ready..."
	sleep 5
	cd server && npm run dev &
	cd web && npm run dev &

# Stop all services
down:
	@echo "🛑 Stopping Ringaroo development stack..."
	docker-compose down
	pkill -f "npm run dev" || true

# Clean everything
clean: down
	docker-compose down -v
	docker system prune -f
	npm run clean

# Install dependencies
install:
	npm install
	cd server && npm install
	cd web && npm install

# Run tests
test:
	npm run test

# Build all packages
build:
	npm run build

# Reset and restart everything
reset: clean install up

# Show logs
logs:
	docker-compose logs -f

# Run database migrations
migrate:
	cd server && npm run migrate

# Seed test data
seed:
	cd server && npm run seed 