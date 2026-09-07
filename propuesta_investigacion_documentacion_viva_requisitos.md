# Documentación Viva de Requisitos con Agentes LLM + RAG

## Resumen ejecutivo

Este proyecto busca diseñar, implementar y evaluar experimentalmente un sistema de apoyo a la Ingeniería de Requisitos que mantenga la documentación (historias de usuario, requisitos funcionales, NFRs) **actualizada de forma continua** a partir de reuniones reales, combinando un agente conversacional en tiempo real (tipo copiloto de reunión) con una pipeline asíncrona basada en LLM + RAG que propone actualizaciones estructuradas, siempre bajo revisión y aprobación humana.

No se propone un sistema autónomo que modifique requisitos sin supervisión. Se propone un **sistema híbrido humano-IA colaborativo**, con trazabilidad completa entre cada requisito y la conversación que lo originó o modificó.

---

## 1. Tema de investigación

**Título tentativo:**
"Documentación viva de requisitos con LLM+RAG: actualización asistida de historias de usuario a partir de reuniones"

**Área(s) SWEBOK involucradas:**
- Software Requirements (elicitación, especificación, validación, gestión de cambios)
- Software Engineering Models and Methods (RAG, multi-agente)
- Professional Practice (colaboración humano-IA)
- Software Quality (criterios QUS, consistencia, trazabilidad)

**Tecnología emergente:** LLMs conversacionales (tipo Claude/GPT), agentes autónomos, RAG (Retrieval-Augmented Generation), transcripción en tiempo real.

---

## 2. Descripción del problema

En proyectos de software reales (incluyendo contextos universitarios y B2B), la documentación de requisitos se genera y actualiza de forma manual, discontinua y desconectada de las conversaciones donde realmente ocurren los cambios:

- Las decisiones se toman en reuniones, pero se trasladan tarde (o nunca completamente) a los documentos formales.
- No existe trazabilidad clara entre "qué se dijo en la reunión" y "qué requisito cambió".
- El mantenimiento del backlog/SRS es costoso: el rework por requisitos mal entendidos puede consumir hasta 40-50% del esfuerzo de desarrollo en equipos ágiles.
- Las herramientas actuales basadas en LLM (GeneUS, UStAI, RECOVER, RGEN, pipelines prompt-driven) resuelven fragmentos del problema (generación puntual de historias, extracción desde transcripciones ya cerradas), pero:
  - Pocas veces mantienen la documentación **viva** de forma continua tras cada nueva reunión.
  - La automatización sin supervisión genera riesgo de alucinaciones, cambios silenciosos e inconsistencias.
  - Existe poca evidencia experimental en contextos latinoamericanos/universitarios sobre el impacto real de estas pipelines híbridas en calidad, trazabilidad y esfuerzo de mantenimiento.
  - La colaboración entre múltiples stakeholders y agentes (no solo un LLM aislado) está subexplorada.

**Problema específico:**
¿Cómo diseñar un sistema colaborativo humano-IA que capture información de reuniones (en tiempo real y/o post-reunión), proponga actualizaciones estructuradas y trazables a la documentación de requisitos, y permita a los stakeholders revisar/aprobar esos cambios sin perder control ni calidad, mejorando frente al proceso manual tradicional?

---

## 3. Objetivo

### Objetivo general
Diseñar, implementar y evaluar experimentalmente una pipeline híbrida (agente de reunión en tiempo real + procesamiento asíncrono LLM+RAG) que mantenga viva la documentación de requisitos de un proyecto de software, midiendo su impacto en calidad, trazabilidad y esfuerzo de mantenimiento frente a un proceso manual.

### Objetivos específicos
1. Modelar el proceso actual de documentación de requisitos (línea base) identificando problemas de continuidad y trazabilidad.
2. Diseñar la arquitectura del sistema con dos modos claros:
   - **Modo Descubrimiento** (primera reunión, sin requisitos previos): generación del primer borrador estructurado.
   - **Modo Documentación Viva** (reuniones subsecuentes): propuesta de actualizaciones sobre el baseline existente.
3. Implementar un prototipo funcional con recursos razonables (Docker, APIs LLM, motor de indexación RAG, repositorio de requisitos versionado).
4. Definir métricas de calidad (QUS, completitud, consistencia), trazabilidad (precisión/recall de enlaces requisito-conversación) y esfuerzo (tiempo de post-edición humana).
5. Ejecutar un experimento controlado comparando proceso manual vs. proceso asistido en varias iteraciones/reuniones reales o simuladas.
6. Analizar resultados y delimitar hasta dónde es seguro automatizar y dónde debe mantenerse la revisión humana.

---

## 4. Arquitectura conceptual del sistema

```
[Reunión en vivo]
   │
   ├── Capturador (transcripción en tiempo real: audio → texto)
   │       └── Agente Copiloto: toma notas, sugiere preguntas, resume en vivo
   │              (NO modifica requisitos durante la sesión)
   │
   ▼
[Transcript + notas curadas]
   │
   ▼
[Pipeline asíncrona post-reunión]
   ├── Clasificación de segmentos relevantes (candidatos a requisitos)
   ├── RAG sobre repositorio de requisitos existentes + documentos de dominio
   ├── Generación/actualización de artefactos en formatos seleccionables:
   │       - Historias de usuario + criterios de aceptación (QUS)
   │       - Requisitos funcionales tabulares
   │       - Requisitos no funcionales (NFR)
   ├── Validación simbólica (reglas: duplicados, conflictos, inconsistencias)
   └── Propuesta de cambios (change requests) con traza a la conversación origen
   │
   ▼
[Workspace colaborativo]
   ├── Analistas, Product Owner, stakeholders revisan propuestas
   ├── Aceptan / editan / rechazan cada cambio (como PR de código)
   └── Grafo de conocimiento actualizado: requisito ↔ conversación ↔ decisión
```

### Roles de agentes (inspirado en frameworks multi-agente tipo MARE)
- **Agente Colector:** resume la reunión y redacta borradores iniciales.
- **Agente Modelador:** extrae entidades, relaciones y escenarios.
- **Agente Verificador (Checker):** revisa calidad contra criterios (claridad, consistencia, testabilidad).
- **Agente Documentador:** genera el artefacto final en el formato elegido.

---

## 5. Diseño experimental

El estudio no compara un método manual contra uno asistido. Compara **una
cadena asistida consigo misma a lo largo de sus iteraciones**: el objeto de
medición es cómo evolucionan la especificación y la conducta de quien la revisa
a medida que el documento crece.

Esa elección es deliberada. Un brazo manual exigiría un equipo espejo
documentando las mismas reuniones a mano durante todo el proyecto, esfuerzo
fuera del alcance de una tesis de grado; y el fenómeno que se investiga
—deterioro progresivo— no requiere un grupo de control externo, porque cada
iteración se compara contra las anteriores de la misma cadena.

**Unidad de análisis:** la propuesta de cambio decidida. Cada una aporta un
registro con su latencia de decisión, su acción y, si fue sembrada, su tipo de
defecto.

**Variables dependientes, con su operacionalización.**

| Variable | Cómo se mide | Instrumento |
| --- | --- | --- |
| Deriva estructural | responsabilidades por requisito y proporción que excede el límite de atomicidad, por revisión | consulta determinista sobre el historial de revisiones |
| Vigilancia del revisor | intervalo entre que la propuesta aparece en pantalla y se decide | marcas `presented_at` / `decided_at`, una por propuesta |
| Detección de error | proporción de propuestas sembradas que fueron rechazadas o corregidas | inyección controlada (§5.1) |
| Verificación de la cita | proporción de propuestas aceptadas cuya evidencia no las sostiene | tipo de defecto `citation_drift` |

**Variable de agrupamiento:** el número de iteración. No hay asignación
aleatoria a condiciones: el diseño es longitudinal de medidas repetidas sobre
una misma cadena.

**Iteración 1 como calibración.** La primera reunión de un proyecto corre en
modo descubrimiento: no existe documento previo, el agente redacta un primer
borrador en lugar de proponer cambios, y los candidatos se presentan agrupados
en vez de uno por vez. El intervalo de decisión mide algo distinto y no es
comparable con el de las iteraciones siguientes. Por eso la iteración 1 queda
fuera de las comparaciones de vigilancia y funciona únicamente como línea base
del documento: la curva de deriva parte de ella, pero su serie de decisiones no
entra en el análisis.

En esta investigación la iteración 1 cumple además un segundo rol de piloto.
Fue la corrida con la que se depuró el instrumento, y expuso cuatro defectos de
medición que habrían invalidado sus datos: un reloj compartido entre propuestas
que registraba tiempo de sesión en lugar de latencia de decisión, una ventana de
contexto que mostraba tres cuartos de la transcripción para verificar una sola
cita, un editor que arrastraba el texto de una propuesta a la siguiente, y la
ausencia del paso que traslada las decisiones aprobadas al documento. Todos
fueron corregidos antes de la iteración 2, y esa corrección es la razón por la
que la cadena medida comienza allí.

**Modelo generador.** El modelo queda fijo para toda la cadena medida y se
registra con cada llamada. La iteración piloto se generó con un modelo distinto
del que usa la cadena posterior; el registro de procedencia lo hace explícito, y
es una razón adicional para excluirla del análisis comparativo.

**Entorno.** Cadena de 10 a 12 reuniones reales de un mismo proyecto de
software. Transcripción y diarización locales sobre CPU, con modelo y
parámetros fijos; generación de propuestas mediante un modelo de lenguaje
accedido por API, con prompt versionado y registro íntegro de cada llamada. El
audio no abandona el equipo del investigador; la transcripción sí, al enviarse
al modelo generador, lo que se declara en el apartado de consideraciones
éticas.

**Limitación de alcance sobre la generalización.** Con una sola cadena y un
número reducido de revisores, los resultados describen el comportamiento
observado en ese contexto y no permiten afirmar que la vigilancia decae en
general. La afirmación defendible es que, en la cadena estudiada, la vigilancia
evolucionó de determinada manera y esa evolución fue medible con el instrumento
descrito. Ampliar a varios revisores sobre la misma cadena —que el instrumento
soporta, registrando series independientes por persona— es la vía directa para
fortalecer esa inferencia.

### 5.1 Inyección controlada de propuestas defectuosas

**Por qué es necesaria.** Medir si el revisor detecta los errores del agente exige
saber cuáles propuestas son incorrectas. En una corrida puramente observacional
ese dato no existe: si el revisor acepta todas las propuestas de una iteración,
la observación es compatible con dos explicaciones opuestas —que el agente no
cometió errores, o que el revisor no los examinó— y nada en los datos permite
separarlas. Sembrar defectos conocidos provee el denominador que hace medible la
tasa de detección.

**Operacionalización.** Tras la generación y antes de la revisión, una proporción
fija de las propuestas de cada iteración se sustituye por una versión defectuosa
de sí misma. La proporción se fija en **25%** y no se modifica una vez iniciada la
corrida. Con 10 a 12 iteraciones y entre 7 y 10 propuestas por iteración, el
procedimiento produce del orden de 20 a 30 propuestas defectuosas, magnitud
mínima para estimar una tasa de detección con un intervalo de confianza
informativo.

**Tipos de defecto.** Se emplean cuatro, elegidos porque cada uno exige una
conducta distinta para ser detectado. Esa diferencia es el objeto de medición: no
se busca una tasa global, sino distinguir qué clase de verificación realiza el
revisor.

| Tipo | Alteración | Conducta que exige detectarlo |
| --- | --- | --- |
| Cita desplazada | se reemplazan los turnos citados; el texto no cambia | abrir el contexto y contrastar la evidencia |
| Precisión inventada | se agrega un valor concreto ausente de la transcripción | advertir que ese dato nunca se enunció |
| Rol desplazado | se atribuye la necesidad a otro participante de la reunión | conocer quién declaró qué |
| Cláusula colapsada | se absorbe la obligación de otro requisito | reconocer que son responsabilidades distintas |

Los tipos se rotan entre propuestas. Si todos los defectos de una corrida fueran
del mismo tipo, el revisor aprendería el patrón y las iteraciones tardías
medirían aprendizaje en lugar de vigilancia.

**Construcción de los defectos.** Cada propuesta defectuosa se deriva por
transformación determinista de una propuesta real generada por el agente, no se
redacta de cero. Una propuesta redactada aparte presenta vocabulario y registro
distintos del resto de la cola, y resulta identificable por su forma antes que
por su contenido; en ese caso se estaría midiendo la factura del experimento y
no la vigilancia del revisor.

La versión defectuosa **sustituye** a la correcta en la cola en lugar de añadirse.
La coexistencia de dos propuestas casi idénticas sobre el mismo requisito
delataría la manipulación. La salida original del modelo no se pierde: queda
registrada íntegra en la bitácora de llamadas, que es de solo anexado.

**Reproducibilidad.** El procedimiento es determinista respecto de una semilla
aleatoria. La semilla y la proporción se registran junto con los datos y se
reportan, de modo que la asignación de defectos de cualquier corrida puede
reconstruirse.

**Salvaguardas.** El procedimiento se rechaza a sí mismo en dos situaciones: si la
iteración ya contiene propuestas sembradas —una segunda inyección alteraría la
proporción sin dejar constancia de cuál era la planificada— y si la iteración ya
registra decisiones, porque modificar el texto de una propuesta ya decidida
dejaría el intervalo de decisión asociado a un contenido que el revisor nunca
vio.

**Qué cuenta como detección.** No toda acción distinta de aceptar equivale a
haber advertido el defecto, y tratarlas como equivalentes sobreestima la
detección. La regla depende del tipo:

| Tipo | Detección | Por qué |
| --- | --- | --- |
| Cita desplazada | sólo **rechazar** | el texto del requisito es correcto; lo falso es la evidencia. Editar la redacción mejora el enunciado y deja intacta la cita, de modo que una edición no demuestra que el revisor haya contrastado el turno |
| Precisión inventada | **editar** o rechazar | el dato fabricado está en el texto; quitarlo lo corrige |
| Rol desplazado | **editar** o rechazar | el actor equivocado está en el texto |
| Cláusula colapsada | **editar** o rechazar | las obligaciones fusionadas están en el texto |

Esta distinción surgió al observar la primera corrida con dos revisores: ambos
editaron una propuesta con la cita desplazada, mejorando su redacción sin tocar
los turnos citados. Contadas como detecciones, la tasa habría sido del 100%
para un defecto que ninguno de los dos advirtió.

Se reportan por separado dos cifras: las sembradas **aceptadas** —la lectura
literal— y las sembradas **no detectadas** según la regla anterior. La segunda
es la que responde H1; la primera se conserva porque es la medición cruda y
permite reconstruir la otra.

**Registro.** Cada propuesta sembrada conserva su tipo de defecto y una nota de la
alteración exacta. Las exportaciones incluyen ambos campos, lo que permite
desagregar la tasa de detección por tipo. Reportar «se detectó el 80% de las
citas desplazadas y el 40% de las precisiones inventadas» constituye un
resultado; reportar una tasa agregada, no.

**Amenaza a la validez y deber de reporte.** Este procedimiento convierte una
corrida observacional en un experimento. Los requisitos aprobados en iteraciones
con inyección no representan la salida del agente sino una mezcla deliberada, y
la especificación resultante no debe interpretarse como producto del sistema. El
informe declara explícitamente que la cola contenía propuestas fabricadas, en qué
proporción y de qué tipos; omitirlo permitiría leer los errores sembrados como
errores del modelo.

### 5.2 Protocolo de revisión con múltiples revisores

**Asignación.** Cada revisor procesa **la cadena completa**, de forma
independiente. No se reparten iteraciones entre personas: hacerlo confundiría
por completo el efecto de la iteración con el de quién la revisó, y ante una
caída de vigilancia en la iteración 5 no habría manera de saber si se debe a
que era la quinta o a quién le tocó.

La instrumentación lo permite porque el bloqueo de una propuesta es por persona
—`UNIQUE (proposal_id, participant_id)`—, de modo que la misma cola produce
tantas series independientes como revisores haya.

**Orden de presentación.** Las propuestas se presentan en orden determinista, el
mismo para todos los revisores. Un orden variable introduciría un efecto de
posición imposible de separar del de la iteración.

**Reglas de la sesión.** Tres condiciones sostienen la independencia de las
series y su comparabilidad:

1. **Revisión individual y sin consulta.** Ningún revisor comenta sus decisiones
   con otro antes de terminar la cadena. Un comentario sobre una propuesta
   concreta contamina la serie del que lo escucha.
2. **Misma estructura temporal para todos.** Se fija de antemano cuántas
   iteraciones se revisan por sesión y qué descanso media entre ellas, y la
   regla es idéntica para cada revisor. La fatiga es la variable de interés: si
   un revisor procesa la cadena de una sentada y otro la reparte en varios
   días, sus curvas describen calendarios distintos y no vigilancias distintas.
3. **Ciego respecto de la inyección.** Ningún revisor conoce la proporción de
   propuestas sembradas ni los tipos de defecto. Conocerlos convierte la tarea
   en búsqueda dirigida de errores, que no es la conducta que se quiere medir.

**Documento compartido.** La especificación es una sola por proyecto: la
construyen las decisiones del primer revisor que decide cada propuesta. Los
demás miden vigilancia sobre el mismo material, pero sus decisiones no alteran
el documento. Se designa por ello un **analista de referencia**, cuyas
decisiones constituyen la especificación resultante, y se declara cuál fue.

Esta separación es deliberada: la deriva se mide sobre un único documento
—si cada revisor produjera el suyo, las cadenas divergirían y las propuestas
dejarían de ser las mismas— mientras que la vigilancia se mide por persona.

**Operación.** Los revisores trabajan por turnos en un mismo equipo, y cada uno
selecciona su identidad al comenzar. La aplicación no implementa
autenticación: para el número de revisores previsto, un mecanismo de
credenciales no protegería ningún dato que no esté ya bajo control físico del
investigador. La identidad seleccionada permanece visible durante toda la
sesión, porque una decisión atribuida a la persona equivocada no puede
corregirse después.

**Análisis que habilita.** Con varias series sobre el mismo material pueden
calcularse: la evolución de la latencia por revisor a lo largo de las
iteraciones, la tasa de detección de defectos sembrados desagregada por tipo y
por persona, y la concordancia entre revisores sobre las mismas propuestas.
Esta última permite distinguir las propuestas cuya corrección es objeto de
acuerdo de aquellas en que los revisores difieren, distinción que una sola
serie no ofrece.

**Amenazas remanentes.** La selección de identidad opera por convención y no por
autenticación: una selección equivocada asignaría decisiones a la serie de otra
persona sin que nada lo delate. Se mitiga manteniendo la identidad visible y
verificando el recuento de decisiones por revisor al cerrar cada sesión. El
número de revisores previsto tampoco permite inferencia poblacional; sí permite
distinguir un patrón compartido de una particularidad individual, que es la
distinción que una sola serie no habilita.

---

## 6. Riesgos y límites identificados (sin maquillar)

- **Autonomía excesiva:** ningún cambio debe aplicarse sin aprobación humana; el riesgo de alucinaciones y "drift" del modelo es real y documentado en la literatura.
- **Sobrecarga de revisión:** si el sistema genera demasiadas propuestas, puede aumentar el trabajo en vez de reducirlo; debe medirse explícitamente.
- **Ambigüedad del lenguaje natural:** incluso con transcripciones curadas, el LLM puede "rellenar huecos" de forma incorrecta.
- **Gobernanza y privacidad:** grabar/transcribir reuniones implica consentimiento, manejo de datos sensibles y auditoría de cambios.
- **Alcance del prototipo:** debe limitarse a 2-3 formatos de salida y un dominio acotado (no intentar cubrir todos los formatos y todos los proyectos a la vez).

---

## 7. Antecedentes clave (para estado del arte)

- RECOVER: extracción de requisitos desde conversaciones de stakeholders con LLM, manteniendo al ingeniero como filtro final.
- RGEN (Sanciti AI): transformación de transcripciones de reuniones en requisitos estructurados con trazabilidad a la fuente.
- Pipeline prompt-driven de backlog refinement: agentes LLM + RAG + reglas simbólicas + grafo de conocimiento, con mejoras medidas en exactitud y reducción de esfuerzo de edición.
- MARE: framework multi-agente (Stakeholder, Collector, Modeler, Checker, Documenter) que automatiza el proceso de RE de punta a punta con workspace compartido.
- Multi-Agent Debate en RE: varios agentes LLM debaten para mejorar precisión y reducir sesgos.
- Agentes de voz para elicitud de requisitos: experiencias con LLMs conduciendo sesiones de elicitud en tiempo real.
- Estudios sobre RAG aplicado a requisitos desde documentos de dominio: mejoras en cobertura y reducción de esfuerzo manual.
- Trabajos sobre gobernanza de asistentes de reuniones con IA: brecha creciente entre capacidad técnica y controles organizacionales (consentimiento, auditoría, responsabilidad).

---

## 8. Próximos pasos sugeridos

1. Definir el dominio/proyecto piloto (curso, laboratorio o producto B2B conocido).
2. Elegir 2-3 formatos de documentación a soportar inicialmente.
3. Construir un prototipo mínimo: capturador de audio + LLM para notas y preguntas + pipeline RAG post-reunión.
4. Diseñar el protocolo experimental (qué se mide, cómo se compara, cuántas reuniones).
5. Ejecutar piloto controlado y recolectar métricas.
6. Redactar hallazgos como research paper (estructura IMRaD) con posible envío a conferencia/journal de RE o SE.
