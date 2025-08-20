SHELL := /bin/bash
.ONESHELL:

ENV ?= .env
export $(shell sed -ne 's/^\([^#][^=]*\)=\(.*\)/\1=\2/p' $(ENV))

# Colors
Y := \033[33m
G := \033[32m
R := \033[31m
B := \033[34m
X := \033[0m

help:
	@echo -e "$(B)Targets$(X)"
	@echo "  make env              -> copy .env.example to .env (once)"
	@echo "  make dev              -> local stack: DB, LocalStack, migrations, core APIs, UI"
	@echo "  make dev-all          -> bring up everything including connectors/placer/recon"
	@echo "  make down             -> stop and remove containers"
	@echo "  make logs             -> tail logs (core)"
	@echo "  make migrate-up       -> run all DB migrations"
	@echo "  make migrate-down N=1 -> roll back N migrations"
	@echo "  make test             -> run unit tests (python+go)"
	@echo "  make lint             -> ruff + black check + go vet"
	@echo "  make fmt              -> black + gofumpt"
	@echo "  make cdk-synth        -> synthesize CDK"
	@echo "  make cdk-deploy       -> deploy CDK stack"

env:
	@test -f .env || cp .env.example .env

dev: env
	docker compose --env-file $(ENV) up -d postgres localstack sqs-setup migrate predictor orchestrator auth webapp mapping_admin
	@echo -e "$(G)Local core running: http://localhost:3000 (web), http://localhost:8083 (orchestrator)$(X)"

dev-all: env
	docker compose --env-file $(ENV) up -d
	@echo -e "$(G)All services up. Connectors are running with your local env creds.$(X)"

down:
	docker compose down -v

logs:
	docker compose logs -f orchestrator predictor auth webapp

migrate-up:
	docker compose run --rm migrate

migrate-down:
	@if [ -z "$$N" ]; then echo -e "$(R)Usage: make migrate-down N=1$(X)"; exit 1; fi
	docker run --rm -v $$PWD/db/migrations:/migrations migrate/migrate:v4.16.2 \
		-path=/migrations -database "postgres://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@localhost:5432/$(POSTGRES_DB)?sslmode=disable" down $$N

test:
	# Python tests
	pytest -q services/orchestrator
	pytest -q services/predictor
	pytest -q services/auth || true
	# Go tests
	cd services/connector_betfair && go test ./... -v || true
	cd services/connector_matchbook && go test ./... -v || true
	cd services/connector_smarkets && go test ./... -v || true
	cd services/connector_betdaq && go test ./... -v || true
	cd services/placer && go test ./... -v || true
	cd services/recon && go test ./... -v || true

lint:
	ruff check services || true
	black --check services || true
	cd services/placer && go vet ./... || true

fmt:
	black services || true

cdk-synth:
	cd infra && npm ci && npx cdk synth

cdk-deploy:
	cd infra && npm ci && npx cdk deploy --require-approval never