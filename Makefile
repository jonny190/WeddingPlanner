.PHONY: up down logs ps seed test migrate shell psql

up:  ## Build and start everything for development (http://localhost:8080, mail at :8025)
	docker compose --profile dev up -d --build

down:  ## Stop everything (data is kept in volumes)
	docker compose --profile dev --profile tls down

logs:  ## Follow logs
	docker compose logs -f api worker web

ps:
	docker compose ps

seed:  ## Create the demo account: demo@example.com / demo-password
	docker compose exec api python -m app.scripts.seed_demo

test:  ## Run the backend test suite in a container
	docker compose --profile test run --rm --build tests

migrate:  ## Apply database migrations
	docker compose run --rm migrate

shell:  ## Python shell inside the API container
	docker compose exec api python

psql:  ## SQL shell
	docker compose exec db psql -U wedding wedding
