# Prompt para Figma Make

Copiar desde la línea siguiente. Está en español a propósito: la interfaz es
en español y un prompt en inglés suele devolver etiquetas en inglés.

---

## Qué estoy diseñando

**EchoReq**, una herramienta interna que mantiene actualizada la especificación
de requisitos de un proyecto de software a partir de reuniones con el cliente.
Después de cada reunión, un agente transcribe lo dicho y propone cambios sobre
los requisitos existentes. Una persona revisa esas propuestas una por una y
decide: aceptar, editar o rechazar. Lo aprobado queda como la nueva versión del
documento.

No es un producto comercial: es el **instrumento de medición de un trabajo de
investigación** que estudia si una especificación mantenida con asistencia de
IA se degrada a lo largo de reuniones sucesivas, y en qué momento el revisor
humano deja de revisar con atención.

Quien la usa es un analista o Product Owner, en sesiones de 20 a 40 minutos,
en escritorio. Es una herramienta de trabajo concentrado, no una app de
consumo. Densidad de información alta, sin ruido decorativo.

## Restricciones que NO se pueden cambiar

Esto es lo más importante del pedido. La pantalla de Revisión produce los datos
del estudio, y varias decisiones de interfaz que parecen mejorables son
deliberadas. **No las "arregles":**

1. **Una propuesta por vez.** Sin lista, sin scroll a la siguiente, sin ver lo
   que viene. El tiempo entre que aparece y que se decide es la medición
   principal del estudio.
2. **Sin botón de "aceptar todas".** Existiría, la gente lo usaría, y lo que se
   registraría sería la existencia del atajo en lugar de la atención del
   revisor.
3. **Sin atajos de teclado para decidir.** Un acelerador baja el costo de
   aprobar mucho más que el costo de leer. Mediría ergonomía, no atención.
4. **La cita siempre visible, con contexto.** Cada propuesta muestra el
   fragmento de transcripción que la originó, más dos turnos antes y dos
   después. Sin eso el revisor no puede verificar y termina confiando por
   defecto.
5. **Las señales de calidad avisan, no bloquean ni autocorrigen.** Si el
   sistema detecta que un requisito acumula demasiadas responsabilidades, lo
   informa. No lo impide ni lo arregla solo.
6. **Nada de animaciones de transición entre propuestas.** Agregarían tiempo
   percibido a una medición de tiempo real.

Si ves una oportunidad de mejorar la eficiencia del flujo de revisión,
descartala. La fricción es parte del instrumento.

## Pantallas

Ya existen y funcionan. Quiero elevarlas visualmente, no reinventarlas.

**1 · Captura.** Carga del audio de la reunión con forma de onda, lista de
participantes detectados por diarización con su porcentaje de habla, y una
casilla de consentimiento obligatoria que habilita el botón de procesar. Al
procesar, se muestran cuatro etapas del pipeline en progreso.

**2 · Descubrimiento.** Para la primera reunión, cuando no hay documentación
previa. Dos columnas: transcripción a la izquierda, candidatos a requisito a la
derecha agrupados por tema. Al pasar por un candidato se resaltan sus turnos en
la transcripción. Los candidatos ambiguos muestran qué falta definir en vez de
inventar la regla.

**3 · Revisión.** La pantalla crítica. Arriba: número de propuesta, indicador de
progreso y cronómetro corriendo. Al medio: el requisito vigente y el propuesto,
con el fragmento nuevo resaltado. Abajo, dos columnas: la transcripción de
origen con los turnos citados marcados, y las señales del sistema con los tres
botones de decisión.

**4 · Documento.** La especificación completa, con botones para ver cada
revisión anterior. Cada requisito muestra su texto, cuántas responsabilidades
acumula (con un medidor de barras) y cuántas veces se modificó. Al abrir uno se
ve su historia entera: cada cambio con la reunión y los turnos que lo
originaron.

**5 · Trazabilidad.** Una matriz: requisitos en las filas, iteraciones en las
columnas, y en cada celda una marca según qué pasó (alta, modificación,
propuesta rechazada). Una columna final muestra la evolución de
responsabilidades por requisito, tipo `2 → 3 → 4`.

**6 · Exportar.** Los conjuntos de datos descargables como CSV, cada uno con su
cantidad de filas y un diccionario de columnas desplegable.

## Contenido real para usar

No uses texto de relleno. Este es el caso: un sistema de turnos para una
clínica.

- **R-01** — Como paciente quiero reservar un turno desde el celular, para no
  tener que llamar por teléfono.
- **R-02** — Como paciente quiero cancelar un turno hasta 24 h antes sin costo.
  Si la cancelación ocurre con menos de 24 h, se aplica un cargo del 50%,
  excepto cuando la cancelación la origina el profesional, en cuyo caso el
  paciente puede reprogramar desde la notificación recibida.
- **R-04** — El sistema debe enviar un recordatorio por WhatsApp 24 h antes del
  turno, con envío de SMS de respaldo cuando el paciente no tenga WhatsApp.

`R-02` es el ejemplo central: acumuló cuatro responsabilidades a lo largo de
tres reuniones y por eso aparece marcado en ámbar. Que ese caso se lea de un
vistazo es parte del objetivo del diseño.

Turnos de transcripción de ejemplo:

- `06:28 · turno 10 · PO` — el tema es cuando se cae el médico.
- `06:40 · turno 12 · CL` — Cuando el médico cancela, el paciente tendría que
  poder reprogramar directo desde el mismo mensaje que le llega.
- `06:58 · turno 13 · AN` — Sin volver a entrar a la app, claro.

Hay tres hablantes con color propio: CL cliente, PO product owner, AN analista.

## Dirección visual

Lo que hay hoy y quiero conservar como base:

- Neutros gris verdosos fríos, no grises puros.
- Verde azulado `#0e8f76` en claro y `#3cc4a2` en oscuro como acento
  principal. Saturado a propósito: la versión apagada anterior leía gris.
- Ocre `#a9631c` para advertencias, rojo rosado `#ad2b45` en claro y `#e8657f`
  en oscuro para conflictos y rechazos. Son colores semánticos, distintos del acento.
- IBM Plex Sans para texto, IBM Plex Mono para identificadores, tiempos,
  números y etiquetas.
- Tema claro y oscuro, los dos igual de cuidados.

Evitá: crema con serif y terracota, degradados violeta a azul, tarjetas
redondeadas todas iguales con sombra, emojis como íconos de sección.

## Qué quiero que mejores

1. **Jerarquía dentro de la pantalla de Revisión.** Hoy las tres zonas —el
   cambio propuesto, la transcripción y las señales— pesan casi lo mismo. El
   cambio propuesto debería dominar.
2. **Legibilidad del diff.** Hoy el fragmento nuevo va con fondo sólido del
   acento. Funciona pero es pesado cuando el texto es largo. Buscá una forma
   más elegante de marcar la inserción sin gritar.
3. **El medidor de responsabilidades.** Hoy son barras crecientes. Quiero que
   comunique acumulación de un vistazo y que se distinga a simple vista un
   requisito sano de uno inflado.
4. **La matriz de trazabilidad.** Es la visualización más importante para la
   tesis. Que la fila de un requisito que cada reunión reabre salte a la vista
   contra una que nadie tocó.
5. **Estados vacíos y de error.** Tienen que distinguirse claramente: una cola
   terminada y un backend caído no pueden verse parecidos.
6. **Sistema de componentes coherente.** Hoy hay tarjetas, etiquetas, botones y
   tablas definidos por separado. Quiero un set consistente con reglas claras
   de cuándo usar cada uno.

## Qué necesito de vuelta

- Las seis pantallas en escritorio, tema claro y oscuro.
- La pantalla de Revisión también en dos estados extra: guardando una decisión,
  y con error al guardar.
- Los componentes reutilizables separados: tarjeta, etiqueta de estado, botón,
  fila de transcripción, medidor, celda de matriz.
- La escala tipográfica y los tokens de color, nombrados.

Priorizá la pantalla de Revisión: es la que una persona va a mirar sesenta veces
seguidas.
