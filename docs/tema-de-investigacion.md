# Ficha del tema de investigación

Números al cierre de la reunión 4: 4 reuniones procesadas, 700 turnos,
29 propuestas, 58 decisiones, 23 requisitos vigentes, 4 defectos sembrados,
2 revisores.

---

## ÁREA DE CONOCIMIENTO (SWEBOK)

**Software Requirements** — Capítulo 01, SWEBOK Guide v4.0a (IEEE Computer
Society, 2024).

| Subárea | Qué del instrumento cae ahí |
|---|---|
| §2.2 Elicitation techniques | Transcripción y diarización de reuniones (*protocol analysis*) |
| §3.1 Basic requirements analysis | Propiedad *atomic*, de la que se deriva el indicador de atomicidad |
| §4.2 Structured natural language | Historias de usuario `Como <rol> quiero <capacidad> para <beneficio>` |
| §4.3 Acceptance criteria-based | Escenarios BDD `Given / When / Then` |
| §4.5 Additional attributes | Log inmutable de revisiones (*change history*), motivo de consolidación (*rationale*) |
| §5.1 Requirements reviews | Qué busca un revisor: *errors, omissions, invalid assumptions* |
| §6.2 Requirements change control | Decisión por revisor sobre cada propuesta de cambio |
| §7.3 Requirements tracing | Trazabilidad de cada requisito a los turnos que lo sostienen |
| §7.4 Stability and volatility | Volatilidad por revisión |
| §7.5 Measuring requirements | Volumen, y el mecanismo que autoriza derivar indicadores de §3.1 |

---

## TEMA DE INVESTIGACIÓN

**Requisitos asistidos por un agente LLM: efectos sobre la calidad de la
especificación y el desempeño del revisor humano.**

---

## DESCRIPCIÓN DEL PROBLEMA

Los agentes LLM pueden generar y actualizar requisitos a partir de reuniones,
pero no se conoce suficientemente cómo esta asistencia afecta la calidad de la
especificación ni el desempeño del revisor humano a lo largo de varias
iteraciones.

La acumulación de cambios puede aumentar la ambigüedad, reducir la atomicidad e
introducir defectos de trazabilidad —como `citation_drift`, donde la evidencia
citada no respalda el requisito—.

SWEBOK v4 identifica dos problemas primarios de los requisitos: *incompleteness*
y *ambiguity*. Un agente que procesa la transcripción íntegra de una reunión
ataca el primero: no olvida lo que se dijo y puede citar el turno exacto que
sostiene cada propuesta. **El costo de esa asistencia sobre el segundo, y sobre
la atención de quien revisa, es lo que no está medido.**

---

## OBJETIVO

Diseñar y aplicar un instrumento para medir, durante varias iteraciones de
elicitación asistida por LLM, la evolución de la calidad de la especificación de
requisitos, el esfuerzo del revisor humano y la detección de defectos en un
proyecto real.

### Objetivos específicos

1. **Registrar la cadena completa** de forma auditable: reunión → turnos con
   hablante identificado → propuesta del agente con los turnos que la sostienen
   → decisión de cada revisor con su intervalo medido → revisión del documento.
2. **Medir la calidad de la especificación** en tres indicadores: atomicidad
   (§3.1 vía §7.5), volatilidad (§7.4) y volumen (§7.5).
3. **Medir el esfuerzo del revisor**: tiempo mediano de decisión y proporción de
   propuestas aceptadas sin editar, por iteración.
4. **Medir la detección de defectos** mediante siembra controlada con semilla
   declarada, distinguiendo por tipo de defecto.
5. **Medir la ambigüedad residual**: proporción de requisitos que no admiten un
   criterio de aceptación verificable sin consulta adicional al stakeholder.
6. **Medir la concordancia entre revisores** sobre la misma cola, registrando en
   una capa separada y corregible qué versión rige cuando difieren.

---

## PREGUNTAS DE INVESTIGACIÓN

> **Nota sobre la estructura.** El trabajo tiene dos partes con métodos
> distintos, y las preguntas se separan en consecuencia. **P1 se responde con la
> revisión sistemática de literatura** —a la que corresponden los criterios de
> inclusión y exclusión de más abajo—. **P2 a P5 se responden con el
> instrumento**, sobre el proyecto real. Mezclarlas en una sola lista deja sin
> método declarado a la mitad de las preguntas.

### Parte I — Revisión sistemática de literatura

**P1.** ¿Cómo se evalúa la calidad de los requisitos generados por LLM y con qué
métricas?

### Parte II — Estudio longitudinal de caso único

**P2.** ¿Cómo evoluciona la calidad de la especificación —atomicidad,
volatilidad y volumen— a lo largo de las iteraciones de elicitación asistida?

**P3.** ¿El esfuerzo del revisor —tiempo de decisión y proporción de propuestas
aceptadas sin editar— varía sistemáticamente a medida que avanzan las
iteraciones?

**P4.** ¿Qué proporción de las propuestas defectuosas sembradas atraviesa la
revisión humana, y difiere esa proporción según el tipo de defecto?

**P5.** ¿Qué proporción de los requisitos producidos por la cadena asistida no
admite un criterio de aceptación verificable sin consulta adicional al
stakeholder?

> **Corrección respecto de la versión anterior.** La lista tenía tres preguntas
> y dejaba sin cubrir dos de las tres cosas que el título y el objetivo
> prometen: el desempeño del revisor y la detección de defectos. Se agregaron P3
> y P4. También se reformuló la pregunta sobre mantenibilidad: *«¿cuán mantenible
> resulta la documentación?»* usaba un término que el instrumento no mide y que
> el capítulo no define para requisitos. Lo que sí se mide —atomicidad,
> volatilidad, volumen— pasa a nombrarse explícitamente en P2.

---

## CRITERIOS DE INCLUSIÓN

*Aplican a la revisión sistemática de literatura (P1).*

- Artículos publicados entre 2022 y 2026.
- Publicados en revistas o congresos revisados por pares: Scopus, Web of
  Science, IEEE Xplore, ACM Digital Library.
- En inglés o español.
- Que traten el uso de LLM en ingeniería de requisitos: elicitación,
  especificación, validación o gestión de cambios.
- Que presenten evaluación empírica: caso de estudio, experimento o métricas.

### Criterios de inclusión del estudio de caso (P2–P5)

- Proyecto de software real, en ejecución, con stakeholders que no participan de
  la investigación.
- Elicitación por reuniones grabadas, con consentimiento registrado y su fecha.
- Especificación mantenida en historias de usuario en español.
- Serie de al menos diez iteraciones procesadas con la misma configuración de
  modelo.
- Transcripción y diarización producidas por la misma configuración declarada,
  con sus parámetros registrados.
- Decisiones tomadas por revisores que no conocen qué propuestas fueron
  sembradas con defectos.
- Intervalo de decisión medido por el instrumento, nunca declarado por la
  persona.

---

## CRITERIOS DE EXCLUSIÓN

*Aplican a la revisión sistemática de literatura (P1).*

- Artículos duplicados entre bases de datos.
- Estudios sobre LLM que no aborden requisitos —por ejemplo, sólo generación de
  código o testing—.
- Resúmenes, pósters, editoriales o capítulos sin revisión por pares.
- Propuestas sin ninguna evaluación.
- Publicaciones anteriores a 2022.

### Criterios de exclusión del estudio de caso (P2–P5)

**Del análisis cuantitativo**

- **Reuniones de descubrimiento.** Los candidatos se presentan todos a la vez y
  el revisor entra y sale de ellos: el intervalo mide cuánto estuvo uno al
  frente, no cuánto costó decidirlo. Excluidas de la curva de tiempo de decisión
  (P3), incluidas en el resto.
- **Propuestas revisadas por una sola persona.** Sin cruce no hay concordancia
  que medir.
- **Reuniones procesadas con un modelo distinto al de la serie.** La reunión 1
  se generó con `gemini-3.8-flash` y el resto con `gemini-3.7-flash`; queda
  declarada como excepción y fuera de toda comparación entre iteraciones que
  dependa del comportamiento del modelo.
- **Iteraciones cuya siembra de defectos no tenga semilla, proporción y tipos
  declarados.**

**Del alcance del trabajo**

- **Requisitos de proyecto** —costo, cronograma, dotación—. SWEBOK §1.3 los
  asigna a las áreas de Gestión y Proceso; el capítulo de requisitos
  explícitamente no los trata.
- **§6.3 Scope Matching y §7.2 Prioritization.** Requieren costo, cronograma y
  entrega, que el estudio no observa.
- **§3.3 Formal Analysis, §4.4 Model-Based Specification, §8.2 y §8.3.** El
  corpus es lenguaje natural estructurado por diseño.
- **§5.2 Simulation y §5.3 Prototyping.** No se construye software.
- **Comparación contra un proceso manual.** No existe grupo de control: la base
  contiene el proyecto del estudio y un fixture de prueba, no una cadena llevada
  a mano. El diseño es longitudinal de caso único —mide evolución en el tiempo,
  no diferencia contra una alternativa—.

---

## QUÉ MIDE EL INSTRUMENTO HOY

### Con cita directa del capítulo

| Indicador | Cita | Serie observada |
|---|---|---|
| **Atomicidad** — responsabilidades por requisito | §3.1 *"atomic, represent a single decision"* + §7.5 autoriza derivarlo | media 1,29 → 1,42 → 1,55 → 1,52 · sobre el límite 0 → 1 → 4 → 4 |
| **Volatilidad** — proporción del documento que la revisión vuelve a tocar | §7.4 *"the likelihood that a requirement will change in a given time"* | 0 % → 8,3 % → 15,0 % → 4,3 % |
| **Volumen** — requisitos vigentes | §7.5 *"the denominator in other measurements"* | 7 → 12 → 20 → 23 |
| **Trazabilidad** — requisitos con turnos citados | §7.3, dirección hacia atrás a *source documentation* | 23 de 23, entre 2 y 9 turnos cada uno |

### Con respaldo indirecto

| Indicador | Anclaje | Serie observada |
|---|---|---|
| **Detección de defectos** | §5.1 enumera qué busca un revisor | 3 de 4 sembrados sin detectar |
| **Ambigüedad** | §Introduction la nombra problema primario; §4.3 aporta el mecanismo | sin datos aún |

### Sin respaldo en el capítulo — aporte propio a declarar

| Indicador | Serie observada |
|---|---|
| **Tiempo mediano de decisión** | 4,6 s → 3,0 s → 4,5 s → 12,0 s |
| **Aceptadas sin editar** | 71 % → 100 % → 67 % → 100 % |
| **Concordancia entre revisores** | 29 propuestas cruzadas · 79 % de coincidencia |
| **Deriva de vocabulario de roles** | 5 → 6 → 13 → 15 nombres para 4 → 7 roles |

§7.6 menciona *"requirements process measures and benchmarking"* de forma
genérica y no respalda ninguno de estos indicadores en particular. Se declaran
como aporte propio, no como conformidad con el estándar.

---

## APORTE ORIGINAL

**`citation_drift` como clase de defecto propia de la elicitación asistida.**

El agente produce un requisito correcto en su redacción y lo respalda con turnos
de reunión que no lo sostienen. El texto pasa cualquier revisión de redacción;
la evidencia es falsa.

§7.3 describe la verificación de trazabilidad como un ejercicio contable:
*"For each identified software requirement, are there identified design elements
intended to satisfy it?"* La pregunta es **si el vínculo existe**, no si el
vínculo se sostiene. Con elicitación humana la distinción es irrelevante —quien
escribe un requisito no fabrica su fuente—. **Con un agente, el vínculo puede
existir y estar mal.**

La contribución no es proponer una categoría inexistente, sino mostrar que un
chequeo establecido descansa sobre un supuesto que la asistencia automatizada
invalida.

Los otros dos tipos sembrados sí tienen correspondencia: `invented_precision`
cae bajo *invalid assumptions* (§5.1) y `role_shift` viola la propiedad de §3.1
de representar necesidades reales del stakeholder.

**Operacionalización.** La detección se registra como rechazo de la propuesta.
Editar el texto no cuenta: en una cita desplazada el texto es correcto y
editarlo deja la evidencia falsa intacta. De las dos citas desplazadas sembradas,
ninguna fue detectada; en una de ellas ambos revisores editaron el texto.

---

## LIMITACIONES A DECLARAR

1. **El cliente no valida.** §5.1 recomienda revisar desde múltiples
   perspectivas —cliente, ingeniero de requisitos, constructor—. Los dos
   revisores son ambos analistas. Es replicación deliberada para medir
   concordancia entre observadores equivalentes, no cumplimiento de §5.1.
2. **El documento avanza con quien decide primero.** §6.2 exige *"a responsible
   person or group"*, singular y designado. El instrumento permite que cualquiera
   de los dos revisores escriba la revisión, porque las series deben correr en
   paralelo. Decisión de diseño experimental.
3. **Las decisiones no trazan al cliente.** §3.4 señala que, por razones
   contractuales, la resolución de conflictos debería ser trazable al cliente.
   Las consolidaciones registran al analista que resolvió y su motivo.
4. **El instrumento implementa dos de las tres salidas de §6.2.** Falta `defer`.
   Se mantuvo así para no alterar la población de decisiones medidas a mitad de
   la serie.
5. **Reunión 3 contaminada.** El investigador conoció qué propuestas habían sido
   sembradas antes de revisarlas.
6. **Un revisor pudo leer el documento antes del tope por avance.** Las
   decisiones de la reunión 1 del segundo revisor se tomaron cuando los
   requisitos resultantes ya eran visibles con las ediciones del primero.
7. **El estimador de atomicidad es heurístico.** Detecta acciones coordinadas; no
   detecta responsabilidad múltiple semántica —«gestionar el padrón» es un CRUD
   completo detrás de un solo verbo—.
8. **La detección de defectos puede dar falsos positivos.** Un rechazo por causa
   ajena al defecto sembrado se contabiliza como detección. El instrumento
   registra el motivo del rechazo, de modo que la revisión es manual y caso por
   caso.
9. **`clause_collapse` no tiene casos.** El instrumento define cuatro tipos de
   defecto y sólo se sembraron tres. El cuarto queda sin observaciones.
