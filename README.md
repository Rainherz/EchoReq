# EchoReq

Instrumento de medición para el estudio **deriva de especificación en
documentación de requisitos mantenida por LLM**.

El sistema mantiene una especificación de requisitos a partir de reuniones
sucesivas y registra qué decide el revisor humano en cada iteración. El
software es el banco de pruebas: la contribución del trabajo es lo que se
mide con él, no la herramienta.

Encuadre: SWEBOK v4, KA 1 — tópicos 6 (Requirements Management Activities) y
7 (Practical Considerations: trazabilidad, estabilidad, medición).

## Cómo correrlo

Base de datos:

```bash
docker compose up -d          # PostgreSQL 17 + pgvector en :5433
```

API:

```bash
cd api
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python seed.py --reset   # carga el fixture Clínica Norte
.venv/bin/uvicorn app.main:app --port 8010 --reload
```

Interfaz:

```bash
cd web
pnpm install
pnpm dev
```

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Compila `tsc` + build de producción |
| `pnpm exec tsc --noEmit` | Verificación de tipos |
| `pnpm exec oxlint src` | Linter |

## Estado

Fase 1 — interfaces sobre datos mock, sin backend.

| Pantalla | Ruta | Estado |
| --- | --- | --- |
| Captura | `#sessions` | Lista |
| Descubrimiento | `#discovery` | Lista |
| Revisión | `#review` | Lista |
| Documento | `#document` | Lista |
| Trazabilidad | `#traceability` | Lista |
| Iteraciones · Exportar | `#iterations` `#export` | Pendientes |

Fase 2 — backend sobre PostgreSQL. Esquema, repositorios y endpoints listos;
la interfaz todavía consume mocks locales.

| Endpoint | Qué devuelve |
| --- | --- |
| `GET /api/projects/{id}/iterations/{n}/queue?participant=` | Propuestas pendientes con el contexto de cada cita |
| `POST /api/review-decisions` | Anexa la decisión y devuelve el intervalo medido |
| `GET /api/projects/{id}/document?revision=` | Especificación derivada en esa revisión |
| `GET /api/projects/{id}/requirements/{rid}/history` | Historia completa del requisito |
| `GET /api/projects/{id}/metrics` | Mediana de decisión y aceptación de defectuosas por iteración |
| `GET /api/projects/{id}/drift` | Deriva sintáctica por revisión |

Pendiente: conectar la interfaz a la API y el pipeline de transcripción y
generación de propuestas.

### Inmutabilidad

`requirement_revisions`, `review_decisions`, `llm_calls` y `turns` son de solo
anexado, y la restricción se hace cumplir con triggers en la base, no por
convención del código. Un `UPDATE` accidental sobre una decisión de revisión
destruiría datos que no se pueden reconstruir. La única vía de reinicio es
`TRUNCATE`, y solo sobre una base de prueba.

## Estructura

```
web/src/
  requirements/          el dominio nombra el proyecto
    domain/              tipos, diff, derivación del documento
    capture/             audio, participantes, consentimiento
    discovery/           primer borrador (reunión 1)
    review/              cola de revisión instrumentada
    document/            especificación por revisión
    traceability/        matriz requisitos x iteraciones
  shell/                 navegación y layout
  mocks/                 fixture Clínica Norte
  styles/                tokens y primitivos
```

Cada pantalla sigue container-presentational: el contenedor tiene el estado,
los componentes de `components/` son puros.

## Restricciones de instrumentación

La pantalla de Revisión produce los datos del estudio. Estas reglas no son
preferencias de diseño y **no pueden cambiarse durante una corrida**:

- **Una propuesta por vez.** El intervalo `presented_at` → `decided_at` es la
  medición de registro. Abrir el editor no reinicia el reloj.
- **Sin aceptar en lote.** Un botón de "aceptar todas" registraría la
  existencia del atajo, no la vigilancia del revisor.
- **Sin atajos de teclado.** Un acelerador baja el costo de aprobar mucho más
  que el de leer: mediría ergonomía en lugar de atención.
- **La cita siempre visible, con contexto.** Sin poder verificar el turno de
  origen, el revisor confía por defecto — y eso es justo lo que hay que poder
  distinguir.
- **Las señales del sistema avisan, no bloquean.** Una regla que corrige sola
  mide la regla, no a la persona.
- **La interfaz no cambia entre iteraciones.** Es parte del instrumento: un
  cambio en la iteración 6 parte la serie en dos.

La pantalla de Descubrimiento sí usa otra interacción — lista agrupada por
tema en vez de una propuesta por vez. Es admisible únicamente ahí: la revisión
1 es calibración y queda fuera de la curva de deriva, que arranca en la
iteración 2.

## Datos de prueba

`mocks/` contiene el caso ficticio de un sistema de turnos para una clínica,
con tres reuniones encadenadas. `R-02` es el requisito que ilustra la deriva:
acumula cláusulas que deberían haber sido requisitos separados, y la
obligación de reembolso implicada en la reunión 2 nunca quedó documentada.
