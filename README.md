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

Fase 2: backend FastAPI + PostgreSQL/pgvector para persistir
`review_decisions`, `requirement_revisions`, `change_proposals` y `llm_calls`.
Fase 3: pipeline de transcripción y generación de propuestas.

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
