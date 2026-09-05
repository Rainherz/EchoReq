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

La primera vez:

```bash
make setup          # venv de la API + dependencias de la interfaz
make db             # PostgreSQL 17 + pgvector en :5433, espera a que esté lista
make reset          # carga el fixture Clínica Norte
```

Después, en dos terminales:

```bash
make api            # :8010
make web            # :5180
```

Y para comprobar que todo responde:

```bash
make smoke
```

| Comando | Qué hace |
| --- | --- |
| `make setup` | Instala dependencias de API e interfaz |
| `make db` | Levanta PostgreSQL y espera a que acepte conexiones |
| `make api` | API en `:8010` con recarga automática |
| `make web` | Interfaz en `:5180` |
| `make seed` / `make reset` | Carga o recarga el fixture |
| `make smoke` | Verifica el stack entero y muestra los números del estudio |
| `make check` | Tipos, linter y build de la interfaz |
| `make stop` / `make clean` | Baja la base, con o sin su volumen |

`make check` corre el build completo, no solo `tsc --noEmit`: usan
configuraciones distintas y el build detecta errores que la verificación de
tipos suelta deja pasar.

## Estado

Fase 1 — interfaces sobre datos mock, sin backend.

| Pantalla | Ruta | Estado |
| --- | --- | --- |
| Captura | `#sessions` | Lista |
| Descubrimiento | `#discovery` | Lista |
| Revisión | `#review` | Lista |
| Documento | `#document` | Lista |
| Trazabilidad | `#traceability` | Lista |
| Exportar | `#export` | Lista |
| Iteraciones | `#iterations` | Lista |

Fase 2 — backend sobre PostgreSQL, con la interfaz conectada. Revisión,
Documento y Trazabilidad leen y escriben contra la API; Descubrimiento y
Captura siguen sobre mocks porque el pipeline todavía no existe.

| Endpoint | Qué devuelve |
| --- | --- |
| `GET /api/projects/{id}/iterations/{n}/queue?participant=` | Propuestas pendientes con el contexto de cada cita |
| `POST /api/review-decisions` | Anexa la decisión y devuelve el intervalo medido |
| `GET /api/projects/{id}/document?revision=` | Especificación derivada en esa revisión |
| `GET /api/projects/{id}/requirements/{rid}/history` | Historia completa del requisito |
| `GET /api/projects/{id}/metrics` | Mediana de decisión y aceptación de defectuosas por iteración |
| `GET /api/projects/{id}/revisions` | Log completo de revisiones |
| `GET /api/projects/{id}/rejections` | Propuestas rechazadas |
| `GET /api/projects/{id}/drift` | Deriva sintáctica por revisión |
| `GET /api/projects/{id}/export` | Conjuntos disponibles con su diccionario de datos |
| `GET /api/projects/{id}/export/{name}.csv` | Descarga un conjunto como CSV |

Vite redirige `/api` al backend, así que la interfaz no necesita CORS ni
conocer el puerto de la API.

**Una sola implementación de cada regla.** La derivación del documento y el
conteo de responsabilidades viven únicamente en el backend. La interfaz los
consume; no los recalcula. Dos implementaciones de la misma regla terminan
divergiendo, y la que lee el análisis es la del backend.

### Exportación

Cinco conjuntos para el análisis: `decisions`, `revisions`, `proposals`,
`turns` y `llm_calls`. Cada uno lleva su diccionario de datos, definido junto
a la consulta que lo produce, así que la documentación no puede quedar
desfasada del archivo. `decisions` es el origen de H2 y H3.

Las columnas que dependen de reglas de calidad —`responsibilities`— se
calculan en Python con la misma función que usa el resto del sistema, no se
reimplementan en SQL.

### Panel del estudio

`#iterations` muestra la deriva del documento y el tiempo de decisión en
**gráficos separados**, no en dos ejes verticales: responsabilidades y
segundos no comparten escala, y superponerlos haría que el cruce de las
curvas parezca un hallazgo cuando solo depende de las escalas elegidas. Cada
serie lleva su tabla de números al pie.

Con menos de dos puntos no se dibuja una curva: se muestra el valor y qué
falta para que haya tendencia.

Para ver las curvas con serie completa:

```bash
cd api && .venv/bin/python seed.py --reset --with-decisions
```

Esos son **datos inventados** que reproducen el patrón que el estudio busca
detectar, no observaciones. Nunca cargarlos sobre una base con datos reales.

## Generación de propuestas

```bash
cd api
export ANTHROPIC_API_KEY=...
.venv/bin/python generate.py m-2026-09-17            # genera y guarda
.venv/bin/python generate.py m-2026-09-17 --dry-run  # muestra sin guardar
.venv/bin/python generate.py m-2026-09-17 --replay   # relee lo ya registrado
```

**La cita obligatoria se hace cumplir en el código, no en el prompt.** Una
propuesta que apunta a un turno inexistente, que declara una modificación
sobre un requisito que no está, o que viene sin texto, se descarta antes de
llegar a la cola de revisión. Las descartadas se reportan con su motivo:
cuántas no superaron la validación es un dato sobre el comportamiento del
agente, no ruido.

### Reproducibilidad

Los modelos actuales no aceptan `temperature` ni `top_p`, así que **volver a
pedirle al modelo no devuelve lo mismo aunque el prompt sea idéntico**. La
única reproducción exacta es `--replay`, que relee la respuesta guardada en
`llm_calls`. Por eso esa tabla existe y por eso es de solo anexado.

El identificador del modelo queda fijo en `app/adapters/llm/claude_engine.py`
y se registra con cada llamada: un cambio de versión a mitad del estudio
partiría la serie en dos.

El prompt vive completo en `app/adapters/llm/prompts.py` en lugar de armarse
por pedazos, porque es parte del método y tiene que poder citarse en el paper.

Pendiente: transcripción de audio a turnos (WhisperX). Hoy los turnos se
cargan directo en la base; el resto del pipeline ya corre sobre ellos.

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
