.DEFAULT_GOAL := help
SHELL := /bin/bash

API_PORT ?= 8010
WEB_PORT ?= 5180
PY := api/.venv/bin/python
UVICORN := api/.venv/bin/uvicorn
#: La transcripción vive en su propio entorno: torch y los modelos no tienen
#: por qué instalarse para levantar la API.
ASR := api/.venv-asr/bin/python

.PHONY: help setup asr db api web seed reset smoke check stop clean

help: ## Muestra esta ayuda
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk -F':.*?## ' '{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

setup: ## Instala dependencias de API e interfaz
	python3 -m venv api/.venv
	api/.venv/bin/pip install -q --upgrade pip
	api/.venv/bin/pip install -q -r api/requirements.txt
	cd web && pnpm install

asr: ## Instala la pila de transcripción (torch de CPU, ~1,5 GB)
	python3 -m venv api/.venv-asr
	api/.venv-asr/bin/pip install -q --upgrade pip
	api/.venv-asr/bin/pip install -q --index-url https://download.pytorch.org/whl/cpu torch torchaudio
	api/.venv-asr/bin/pip install -q -r api/requirements-asr.txt
	@echo "Falta el token: aceptá la licencia de pyannote/speaker-diarization-3.1"
	@echo "en huggingface.co y exportá HF_TOKEN=hf_..."

transcribe: ## Transcribe una reunión · make transcribe M=<meeting_id>
	@test -n "$(M)" || { echo "Falta M. Ejemplo: make transcribe M=proyecto-r1"; exit 1; }
	cd api && ../$(ASR) transcribe.py $(M)

db: ## Levanta PostgreSQL y espera a que acepte conexiones
	docker compose up -d
	@for i in $$(seq 1 40); do \
		docker exec echoreq-db pg_isready -U echoreq -d echoreq >/dev/null 2>&1 && \
			{ echo "db lista"; exit 0; }; \
		sleep 0.5; \
	done; echo "la db no respondió"; exit 1

seed: ## Carga el fixture Clínica Norte
	cd api && ../$(PY) seed.py

reset: ## Vacía y recarga el fixture
	cd api && ../$(PY) seed.py --reset

api: db ## Levanta la API en :8010
	cd api && ../$(UVICORN) app.main:app --port $(API_PORT) --reload

web: ## Levanta la interfaz en :5180
	cd web && pnpm dev

check: ## Tipos, linter y build de la interfaz
	cd web && pnpm exec tsc --noEmit && pnpm exec oxlint src && pnpm build

smoke: ## Verifica que el stack entero responde
	@./scripts/smoke.sh

stop: ## Baja la base de datos
	docker compose down

clean: ## Baja la base y borra su volumen
	docker compose down -v
