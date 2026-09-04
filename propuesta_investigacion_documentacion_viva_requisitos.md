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

**Variable independiente:** tipo de proceso de documentación de requisitos (manual tradicional vs. asistido por la pipeline híbrida).

**Variables dependientes:**
- Calidad de los requisitos (puntuación QUS, completitud, consistencia, testabilidad).
- Trazabilidad (precisión/recall de enlaces requisito-conversación).
- Esfuerzo de mantenimiento (tiempo de post-edición, número de intervenciones manuales).
- Satisfacción/confianza percibida por los stakeholders (encuesta).

**Grupo de comparación:** mismo conjunto de reuniones/proyecto, procesado en paralelo por el método manual y por el sistema asistido, o comparación entre dos grupos de estudiantes/equipos.

**Entorno experimental:** proyectos universitarios o de laboratorio con 5-10 reuniones reales o simuladas; Docker para servicios; APIs de LLM (Claude, GPT u open-source); motor de indexación vectorial para RAG (FAISS/pgvector).

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
