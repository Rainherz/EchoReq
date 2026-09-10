# Ficha del tema de investigación

Corregida contra lo que el instrumento hace hoy. Los números salen de la base
del estudio al cierre de la reunión 4: 4 reuniones procesadas, 700 turnos,
29 propuestas, 58 decisiones, 23 requisitos vigentes, 4 defectos sembrados,
2 revisores.

---

## ÁREA DE CONOCIMIENTO (SWEBOK)

**Software Requirements** — Capítulo 01, SWEBOK Guide v4.0a (IEEE Computer
Society, 2024).

Subáreas que el trabajo toca directamente:

| Subárea | Qué del instrumento cae ahí |
|---|---|
| §2.2 Elicitation techniques | Transcripción y diarización de reuniones (*protocol analysis*) |
| §4.2 Structured natural language | Historias de usuario `Como <rol> quiero <capacidad> para <beneficio>` |
| §4.3 Acceptance criteria-based | Escenarios BDD `Given / When / Then` |
| §4.5 Additional attributes | Log inmutable de revisiones (*change history*), motivo de consolidación (*rationale*) |
| §6.2 Requirements change control | Decisión por revisor sobre cada propuesta de cambio |
| §7.3 Requirements tracing | Trazabilidad de cada requisito a los turnos de reunión que lo sostienen |
| §7.4 Stability and volatility | Métrica de volatilidad por revisión |
| §7.5 Measuring requirements | Indicadores derivados de las propiedades de §3.1 |

---

## TEMA DE INVESTIGACIÓN

**Documentación viva de requisitos asistida por LLM: deriva de la
especificación y desempeño del revisor humano a lo largo de iteraciones de
elicitación.**

> **Corrección respecto de la versión anterior.** El enunciado original decía
> «LLM+GraphRAG». El instrumento **no usa GraphRAG ni recuperación aumentada**:
> el agente recibe en el contexto la transcripción de la reunión y la
> especificación vigente completa. Los únicos vectores del sistema son huellas
> de voz (`speaker_voiceprints`, pgvector) usadas para reconocer al mismo
> hablante entre reuniones, no para recuperar requisitos. Sostener «GraphRAG»
> en la ficha es una afirmación falsable en la primera pregunta del jurado.

---

## DESCRIPCIÓN DEL PROBLEMA

SWEBOK v4 §Introduction identifica **dos problemas primarios** de los
requisitos:

1. **Incompleteness** — existen necesidades de stakeholders que nunca se
   revelaron ni se comunicaron.
2. **Ambiguity** — el requisito se comunicó de forma abierta a múltiples
   interpretaciones, y sólo una es correcta.

Un agente que procesa la transcripción íntegra de una reunión ataca el primero:
no olvida lo que se dijo y puede citar el turno exacto que sostiene cada
propuesta.

**El hueco es el costo de esa asistencia, y nadie lo midió.** Tres preguntas
quedan abiertas:

- **Qué le pasa al documento.** La asistencia produce propuestas a un ritmo que
  el proceso manual no alcanzaba. Si cada una acumula cláusulas sobre requisitos
  existentes, la especificación se degrada en atomicidad —propiedad que §3.1
  define como *«atomic, represent a single decision»*— sin que nadie lo advierta
  requisito por requisito.
- **Qué le pasa al revisor.** El humano decide propuesta tras propuesta, reunión
  tras reunión. §5.1 asume un revisor atento; ningún trabajo mide qué ocurre con
  esa atención en la iteración diez.
- **Qué defectos se le pasan.** Un agente que cita turnos introduce una clase de
  defecto que la elicitación humana no produce: el texto es correcto y la
  evidencia que lo respalda no lo sostiene. §5.1 pide a los revisores buscar
  *«errors, omissions, invalid assumptions»*, categorías que no cubren este caso.

> **Corrección respecto de la versión anterior.** Se retiró la afirmación de que
> el rework por requisitos mal entendidos consume 40–50 % del esfuerzo en
> equipos ágiles. No se citaba fuente. Si se reincorpora, debe ir con la
> referencia; de lo contrario debilita toda la sección.

---

## OBJETIVO

### General

Construir un instrumento que registre, de forma reproducible y sin intervención
manual sobre el dato, la cadena completa de elicitación asistida por LLM —de la
transcripción de la reunión a la especificación vigente— y **medir cómo
evolucionan la calidad del documento y el desempeño del revisor humano a lo
largo de las iteraciones**, sobre un proyecto real en ejecución.

> **Corrección respecto de la versión anterior.** El objetivo original prometía
> «evaluar experimentalmente su impacto [...] frente a un proceso manual
> tradicional». **No existe grupo de control manual**: la base tiene el proyecto
> del estudio y un fixture de prueba, no una cadena llevada a mano. Sin control
> no hay comparación posible, y prometerla es prometer un resultado que el
> diseño no puede producir. El objetivo se reformula como estudio longitudinal
> de un solo caso: se mide la evolución en el tiempo, no la diferencia contra
> una alternativa.

### Específicos

1. **Registrar la cadena completa** de forma auditable: reunión → turnos con
   hablante identificado → propuesta del agente con los turnos que la sostienen
   → decisión de cada revisor con su intervalo medido → revisión del documento.
2. **Medir la deriva de la especificación** en dos ejes independientes:
   acumulación de responsabilidades por requisito (§3.1 vía §7.5) y volatilidad
   por revisión (§7.4).
3. **Medir el desempeño del revisor** a lo largo de las iteraciones: tiempo
   mediano de decisión y proporción de propuestas aceptadas sin editar.
4. **Medir la detección de defectos** mediante siembra controlada con semilla
   declarada, distinguiendo tipos de defecto.
5. **Medir la ambigüedad residual** de la especificación: proporción de
   requisitos que no pueden expresarse como escenario de aceptación sin volver a
   consultar al stakeholder.
6. **Medir la concordancia entre revisores** sobre la misma cola, y registrar en
   una capa separada y corregible qué versión rige cuando difieren.

---

## PREGUNTAS DE INVESTIGACIÓN

**P1 — Deriva del documento.** ¿La especificación mantenida con asistencia de
LLM acumula responsabilidades por requisito a lo largo de las iteraciones, y con
qué relación respecto de su volatilidad?

**P2 — Desempeño del revisor.** ¿El tiempo de decisión y la proporción de
propuestas aceptadas sin editar varían sistemáticamente a medida que avanzan las
iteraciones?

**P3 — Detección de defectos.** ¿Qué proporción de las propuestas defectuosas
sembradas atraviesa la revisión humana, y difiere esa proporción según el tipo
de defecto?

**P4 — Concordancia.** ¿Con qué frecuencia dos revisores que trabajan la misma
cola de forma independiente producen decisiones o redacciones distintas, y qué
caracteriza a las propuestas que los dividen?

**P5 — Ambigüedad.** ¿Qué proporción de los requisitos producidos por la cadena
asistida no admite un criterio de aceptación verificable sin consulta adicional
al stakeholder?

---

## CRITERIOS DE INCLUSIÓN

**Del proyecto de estudio**

- Proyecto de software real, en ejecución, con stakeholders que no participan de
  la investigación.
- Elicitación por reuniones grabadas, con consentimiento registrado de los
  participantes y su fecha.
- Especificación mantenida en historias de usuario en español.
- Serie de al menos diez iteraciones procesadas con la misma configuración de
  modelo.

**De las reuniones**

- Audio de la reunión completa, no de fragmentos.
- Transcripción y diarización producidas por la misma configuración declarada
  (`faster-whisper large-v3`, `pyannote`), con sus parámetros registrados.
- Consentimiento registrado antes del procesamiento.

**De las propuestas y decisiones**

- Propuestas generadas por el mismo motor y modelo a lo largo de toda la cadena.
- Decisiones tomadas por revisores que no conocen qué propuestas fueron
  sembradas con defectos.
- Intervalo de decisión medido por el instrumento, nunca declarado por la
  persona.
- Decisiones registradas de forma inmutable, con corrección posible sólo en una
  capa separada y con motivo escrito.

---

## CRITERIOS DE EXCLUSIÓN

**Del análisis cuantitativo**

- **Reuniones de descubrimiento.** Los candidatos se presentan todos a la vez y
  el revisor entra y sale de ellos: el intervalo mide cuánto estuvo uno al
  frente, no cuánto costó decidirlo. Excluidas de la curva de tiempo de decisión
  (P2), incluidas en el resto.
- **Propuestas revisadas por una sola persona.** Sin cruce no hay concordancia
  que medir (P4).
- **Reuniones procesadas con un modelo distinto al de la serie.** La reunión 1
  se generó con `gemini-3.8-flash` y el resto con `gemini-3.7-flash`; queda
  declarada como excepción y fuera de cualquier comparación entre iteraciones que
  dependa del comportamiento del modelo.
- **Iteraciones cuya siembra de defectos no tenga semilla, proporción y tipos
  declarados.**

**Del alcance del trabajo**

- **Requisitos de proyecto** —costo, cronograma, dotación—. SWEBOK §1.3 los
  asigna a las áreas de Gestión y Proceso, y el capítulo de requisitos
  explícitamente no los trata.
- **§6.3 Scope Matching y §7.2 Prioritization.** Requieren costo, cronograma y
  entrega, que el estudio no observa.
- **§3.3 Formal Analysis, §4.4 Model-Based Specification, §8.2 y §8.3.** El
  corpus es lenguaje natural estructurado por diseño; no hay especificación
  formal ni modelos sobre los cuales razonar mecánicamente.
- **§5.2 Simulation y §5.3 Prototyping.** No se construye software, de modo que
  no hay nada que simular ni prototipar.
- **Comparación contra un proceso manual.** No existe grupo de control; ver la
  corrección del objetivo.

---

## LIMITACIONES A DECLARAR

Se enuncian acá porque un jurado las va a encontrar, y declararlas es más fuerte
que defenderlas.

1. **El cliente no valida.** §5.1 recomienda revisar desde múltiples
   perspectivas —cliente, ingeniero de requisitos, constructor—. Los dos
   revisores del estudio son ambos analistas. Es replicación deliberada para
   medir concordancia entre observadores equivalentes, no cumplimiento de la
   recomendación de §5.1.
2. **El documento avanza con quien decide primero.** §6.2 exige *«a responsible
   person or group»*, singular y designado. El instrumento permite que cualquiera
   de los dos revisores escriba la revisión, porque las dos series deben correr
   en paralelo. Decisión de diseño experimental, no conformidad con el estándar.
3. **Las decisiones no trazan al cliente.** §3.4 señala que, por razones
   contractuales, la resolución de conflictos debería ser trazable al cliente.
   Las consolidaciones registran al analista que resolvió y su motivo.
4. **Reunión 3 contaminada.** El investigador conoció qué propuestas habían sido
   sembradas antes de revisarlas. Esa serie queda marcada.
5. **Un revisor pudo leer el documento antes del tope por avance.** Las
   decisiones de la reunión 1 del segundo revisor se tomaron cuando los
   requisitos resultantes ya eran visibles con las ediciones del primero.
6. **El estimador de responsabilidades es heurístico.** Detecta acciones
   coordinadas; no detecta responsabilidad múltiple semántica —«gestionar el
   padrón» es un CRUD completo detrás de un solo verbo—.
7. **El instrumento implementa dos de las tres salidas de §6.2.** Falta
   `defer`. Se mantuvo así para no alterar la población de decisiones medidas a
   mitad de la serie.

---

## APORTE ORIGINAL

**`citation_drift` como clase de defecto propia de la elicitación asistida.**

El agente produce un requisito correcto en su redacción y lo respalda con turnos
de reunión que no lo sostienen. El texto pasa cualquier revisión de redacción; la
evidencia es falsa.

SWEBOK §5.1 enumera lo que los revisores deben buscar —*«errors, omissions,
invalid assumptions, lack of clarity and deviation from accepted practice»*— y
ninguna categoría lo cubre. No es una omisión del estándar: el capítulo asume
elicitación humana, donde nadie cita turnos.

Los otros dos tipos sembrados sí tienen correspondencia: `invented_precision`
cae bajo *invalid assumptions*, y `role_shift` viola la propiedad de §3.1 de
representar necesidades reales del stakeholder.
