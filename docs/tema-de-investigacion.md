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

**Verificación contra trabajo relacionado (septiembre 2026).** Broccia et al.,
*"Human-AI Collaboration in Requirements Engineering: Evidence of the Negative
Effect of LLMs on Requirements Inspection"* (arXiv:2608.21298v1, ago. 2026), es
el trabajo empírico más reciente localizado sobre LLMs y calidad de requisitos.
Su taxonomía de nueve tipos de *requirements smell* (léxicos, sintácticos,
semánticos) y los ocho trabajos relacionados que resume no incluyen ninguna
categoría que verifique si una fuente atribuida a un requisito efectivamente lo
sostiene — la razón estructural es que su LLM es un asistente de consulta sobre
un documento ya fijo, nunca un agente que genera requisitos con evidencia
atribuida, así que el defecto que describe `citation_drift` no tiene dónde
existir en ese diseño. Sostiene, con esta evidencia negativa concreta, que el
aporte permanece sin cubrir en la literatura revisada hasta la fecha.

El mismo trabajo aporta la cita más sólida para el planteamiento del problema:
con un experimento *crossover* controlado (34 sujetos, inferencia causal
bayesiana explícita) encuentran que ChatGPT **no** reduce el tiempo de
inspección y **empeora** en ~8 % la detección de *smells* respecto de la
inspección sin asistencia — evidencia directa de que la asistencia de un LLM no
es sinónimo de mejora en tareas de ingeniería de requisitos.

Y marca una diferencia de diseño que conviene reconocer explícitamente en
limitaciones: ellos logran causalidad mediante manipulación controlada (con LLM
/ sin LLM) sobre documentos ficticios más simples que los industriales —amenaza
a validez externa que los propios autores declaran—; el presente estudio, al
ser un caso longitudinal único sin grupo de control y con el agente siempre
activo, no puede aislar su efecto causal de la misma manera, y sacrifica esa
fuerza inferencial a cambio de validez ecológica: un proyecto real, no un
documento de laboratorio.

**Segunda verificación, contra la revisión sistemática de mayor cobertura del
área (septiembre 2026).** Cheng, Husen, Lu, Racharak, Yoshioka, Ubayashi y
Washizaki, *"Generative AI for Requirements Engineering: A Systematic
Literature Review"* (*Software: Practice and Experience*, 2026;56:141–170),
sintetiza **238 estudios primarios** publicados entre 2019 y mayo de 2025 —la
SLR más amplia localizada sobre GenAI aplicado a RE. Su framework de
extracción cubre siete categorías de datos, una taxonomía de seis tipos de
métrica de evaluación (precision/recall/F1, accuracy, evaluación humana,
análisis de error, métricas de NLP, métricas de similitud) y once categorías
de limitaciones reportadas por los propios 238 estudios. **Ninguna de esas
categorías trata verificar que una fuente o cita atribuida por el LLM
efectivamente respalde el requisito que generó**; lo más cercano es
*hallucinations* (63,4 % de prevalencia), pero se define como salida que
contradice el input, el contexto o los hechos —contenido inventado, no
fidelidad de una referencia a su fuente—. Al ser una síntesis de todo el campo
y no un estudio aislado, refuerza la verificación anterior: si el gap
existiera en algún estudio de los 238, el framework de extracción de esta
revisión lo habría capturado en alguna de sus categorías.

La misma SLR cuantifica, con cifra propia, la escasez de estudios como el
presente: **90,3 % de los 238 estudios están en etapa conceptual o de prueba
de concepto, 8,4 % en prototipo, y sólo 1,3 % (3 estudios) en producción**
(RQ5). Un caso longitudinal sobre un proyecto real en ejecución cae en ese
1,3 %. Los propios autores señalan además que *"few studies triangulated
human and quantitative evaluations or reported inter-rater reliability, which
limits external and construct validity"* —el hueco exacto que la medición de
concordancia entre revisores de este instrumento cubre— y que *"human-in-the-
loop and role-based methods are also underexplored"*.

**Tercera verificación, con salvedad de estatus.** Zadenoori, Dąbrowski,
Alhoshan, Zhao y Ferrari, *"Large Language Models (LLMs) for Requirements
Engineering (RE): A Systematic Literature Review"* (preprint enviado a
Elsevier, arXiv:2509.11446v1, sep. 2025), mapea **74 estudios primarios**
sobre LLM4RE publicados 2023–2024. **Es un preprint sin revisión por pares
—los propios autores lo declaran: "This paper is a preliminary study. No
systematic cross-checking has been performed on the retrieved and analysed
studies"—, así que se cita con ese peso menor, nunca en pie de igualdad con
Cheng et al., que sí está en journal indexado.**

Su esquema de extracción —once tareas de RE, seis fases del ciclo de vida,
nueve artefactos de entrada, diez de salida, ocho estrategias de
prompting— tampoco incluye ninguna categoría que capture verificar la
fidelidad de una cita a su fuente, ni aparece mencionado como hallazgo de
alguno de los 74 estudios ni como dirección de trabajo futuro. Es la
tercera fuente independiente, y la más reciente en el campo específico
LLM4RE, que no cubre el aporte.

Aporta además la cita textual más alineada con la elección de diseño de
este trabajo: *"combining Mixed Methods with Field Studies and Experimental
Simulations, also considering **longitudinal observations**, can provide a
more holistic understanding"* (p.54). Y un dato de encuadre para el
planteamiento del problema: elicitación y validación concentran el 40 % de
los 74 estudios, mientras que detección de defectos es marginal (4 %) — la
comunidad se concentra lejos del punto donde vive el aporte de este
trabajo.

---

## LIMITACIONES A DECLARAR

1. **Sin inferencia causal.** El diseño es un caso longitudinal único, sin
   grupo de control y con el agente siempre activo: no permite aislar el
   efecto del LLM del resto de las variables del proyecto, a diferencia de un
   experimento *crossover* controlado como el de Broccia et al. (2026), que sí
   logra causalidad mediante manipulación con/sin LLM sobre 34 sujetos. Se
   opta deliberadamente por validez ecológica —un proyecto real, no un
   documento de laboratorio— a cambio de esa fuerza inferencial. Al mismo tiempo,
   Cheng et al. (2026) cuantifican que sólo el 1,3 % de 238 estudios
   revisados sobre GenAI en RE alcanza producción —el 90,3 % no pasa de
   etapa conceptual—, así que el trabajo se ubica en el segmento menos
   frecuente y de mayor validez externa de la literatura del área.
2. **El cliente no valida.** §5.1 recomienda revisar desde múltiples
   perspectivas —cliente, ingeniero de requisitos, constructor—. Los dos
   revisores son ambos analistas. Es replicación deliberada para medir
   concordancia entre observadores equivalentes, no cumplimiento de §5.1.
3. **El documento avanza con quien decide primero.** §6.2 exige *"a responsible
   person or group"*, singular y designado. El instrumento permite que cualquiera
   de los dos revisores escriba la revisión, porque las series deben correr en
   paralelo. Decisión de diseño experimental.
4. **Las decisiones no trazan al cliente.** §3.4 señala que, por razones
   contractuales, la resolución de conflictos debería ser trazable al cliente.
   Las consolidaciones registran al analista que resolvió y su motivo.
5. **El instrumento implementa dos de las tres salidas de §6.2.** Falta `defer`.
   Se mantuvo así para no alterar la población de decisiones medidas a mitad de
   la serie.
6. **Reunión 3 contaminada.** El investigador conoció qué propuestas habían sido
   sembradas antes de revisarlas.
7. **Un revisor pudo leer el documento antes del tope por avance.** Las
   decisiones de la reunión 1 del segundo revisor se tomaron cuando los
   requisitos resultantes ya eran visibles con las ediciones del primero.
8. **El estimador de atomicidad es heurístico.** Detecta acciones coordinadas; no
   detecta responsabilidad múltiple semántica —«gestionar el padrón» es un CRUD
   completo detrás de un solo verbo—.
9. **La detección de defectos puede dar falsos positivos.** Un rechazo por causa
   ajena al defecto sembrado se contabiliza como detección. El instrumento
   registra el motivo del rechazo, de modo que la revisión es manual y caso por
   caso.
10. **`clause_collapse` no tiene casos.** El instrumento define cuatro tipos de
   defecto y sólo se sembraron tres. El cuarto queda sin observaciones.

---

## TRABAJO RELACIONADO

Broccia, G., Frattini, J., Arora, C., ter Beek, M. H., Fantechi, A., Ferrari,
A., & Vogelsang, A. (2026). *Human-AI Collaboration in Requirements
Engineering: Evidence of the Negative Effect of LLMs on Requirements
Inspection.* arXiv:2608.21298v1. Preprint, no confirmada revisión por pares al
momento de la consulta.

Cheng, H., Husen, J. H., Lu, Y., Racharak, T., Yoshioka, N., Ubayashi, N., &
Washizaki, H. (2026). *Generative AI for Requirements Engineering: A
Systematic Literature Review.* Software: Practice and Experience, 56, 141–170.
https://doi.org/10.1002/spe.70029. Revisión sistemática con protocolo
Kitchenham, 238 estudios primarios (2019–mayo 2025); artículo de acceso
abierto, dataset de extracción público en
github.com/haowei614/GenAI4RE_SLR_Data.

Zadenoori, M. A., Dąbrowski, J., Alhoshan, W., Zhao, L., & Ferrari, A. (2025).
*Large Language Models (LLMs) for Requirements Engineering (RE): A Systematic
Literature Review.* arXiv:2509.11446v1. Preprint enviado a Elsevier, no
revisado por pares; los propios autores lo declaran estudio preliminar sin
verificación cruzada sistemática de los estudios recuperados. 74 estudios
primarios (2023–2024).
