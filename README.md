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
make asr            # opcional: pila de transcripción, ~1,5 GB
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

Fase 2 — backend sobre PostgreSQL, con la interfaz conectada. Todas las
pantallas leen y escriben contra la API.

Fase 3 — pipeline real. El audio se transcribe y se diariza en la máquina del
investigador, y el agente genera propuestas contra la especificación vigente.
Las dos etapas corren como procesos aparte del servidor: la interfaz refleja
lo que quedó en la base, no dispara el trabajo.

Falta que la transcripción y la generación se puedan lanzar desde la interfaz,
y ponerles nombre a los hablantes que la diarización devuelve como `S1`, `S2`.

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

### Motor de generación

Hay dos, y se elige uno por cadena medida:

```bash
export ANTHROPIC_API_KEY=...   # claude-opus-5, por defecto
export GEMINI_API_KEY=...      # gemini-3.7-flash, con --engine gemini
.venv/bin/python generate.py <meeting_id> --project <id> --engine gemini
```

El segundo existe por una razón concreta: el nivel gratuito de Google AI
Studio no pide tarjeta, y no todo proyecto de tesis tiene presupuesto para una
API paga. Es una **sustitución declarada**, no un detalle de implementación —
qué modelo generó las propuestas es parte del método, y `llm_calls` guarda el
identificador real de cada llamada para que el dato pueda rastrearse.

**La cuota del nivel gratuito es por modelo, no por proyecto.** El más nuevo
—`gemini-3.8-flash`— trae unas pocas llamadas diarias: alcanza para probar, no
para procesar una cadena de reuniones. Por eso el motor usa `gemini-3.7-flash`
por defecto, que tiene cuota de trabajo. Se cambia con `--modelo` y el elegido
queda en `llm_calls`. Crear otra clave no sirve; cambiar de modelo, sí.

**El nivel gratuito limita, y toparse es normal.** El motor reintenta hasta
cuatro veces ante un 429 o un 500, respetando los segundos que pide la
respuesta en lugar de inventar una espera. Sólo reintenta esas dos: una
credencial inválida o un esquema mal formado fallan de una, porque reintentar
ahí escondería el problema.

Si aun con los reintentos se agota, la cuota está tomada por un rato más
largo. No se resuelve creando otra clave —la cuota es por proyecto y una clave
nueva comparte el mismo balde— sino esperando. Generar es una llamada por
reunión: la cuota alcanza de sobra para un estudio, y se agota probando, no
usando.

**Un solo motor por cadena.** Cambiarlo entre iteraciones mete la deriva del
modelo adentro de la que se estudia, y las dos dejan de poder separarse. Es el
mismo argumento que fija el transcriptor.

Lo que *no* sirve como motor es un CLI de agente —`claude -p`, `agy`— aunque
llegue al mismo modelo. Se probaron y el problema no es el modelo sino el
envoltorio: anteponen entre 26.000 y 29.000 tokens de system prompt propio que
no se pueden ver ni versionar, con lo cual **el prompt que corre deja de ser el
que está en `prompts.py`** y el método deja de ser citable. Además traen
herramientas de ejecución que no se pueden desactivar, y una corrida
desatendida termina dándole a un agente permiso para actuar sobre la máquina.

**Privacidad, con el nivel gratuito.** Google puede usar el contenido del nivel
sin cargo para entrenar sus modelos. El audio sigue sin salir del equipo, pero
**la transcripción sí sale**, y eso es una diferencia real respecto de lo que
dice el consentimiento registrado. Si se usa esta vía, corresponde declararlo
en el apartado de ética del estudio.

### De la decisión al documento

Aceptar una propuesta no es anotar que alguien la miró: es **escribir la
especificación**. Al registrar la decisión se anexa la revisión
correspondiente, con el texto que dejó el revisor —si editó, manda lo que
escribió él, no lo que propuso el agente.

Rechazar no escribe nada. Un conflicto tampoco: señala una contradicción para
que alguien la resuelva, no la resuelve.

Se aplica al decidir y no al cerrar la iteración, así que abandonar la cola a
la mitad deja una revisión parcial. Es detectable —las métricas dicen cuántas
decisiones tiene cada iteración— pero conviene tenerlo presente al comparar
revisiones entre proyectos.

El documento es uno por proyecto y las decisiones son por persona, así que dos
revisores sobre la misma cola llegan al mismo requisito. El primero lo
escribe; el segundo no lo pisa. Su decisión igual queda registrada, que es lo
que mide el estudio, pero la especificación no se reescribe según quién
terminó último.

**La cita obligatoria se hace cumplir en el código, no en el prompt.** Una
propuesta que apunta a un turno inexistente, que declara una modificación
sobre un requisito que no está, o que viene sin texto, se descarta antes de
llegar a la cola de revisión. Las descartadas se reportan con su motivo:
cuántas no superaron la validación es un dato sobre el comportamiento del
agente, no ruido.

### Inyección controlada

```bash
make inject M=<meeting_id> P=<project> ARGS="--rate 0.25 --seed 7 --dry-run"
```

El estudio mide si el revisor detecta cuándo el agente se equivoca, y con
propuestas observadas eso no se puede medir: si acepta todo, no hay forma de
distinguir que el agente estuvo bien de que el revisor no estaba mirando.
Plantar defectos conocidos da el denominador.

Los defectos se **derivan de propuestas reales**, no se escriben de cero. Una
propuesta inventada suena distinta —otro vocabulario, otro registro— y se
detecta por el estilo antes que por el contenido; ahí se mediría la costura
del experimento y no la vigilancia.

Y **reemplazan** a la propuesta correcta en lugar de sumarse. Dos propuestas
casi iguales sobre el mismo requisito delatarían el defecto por su forma. Lo
que el agente produjo no se pierde: `llm_calls` guarda la respuesta entera y
es de solo anexado.

| Tipo | Qué altera | Qué exige detectarlo |
| --- | --- | --- |
| `citation_drift` | los turnos citados, no el texto | abrir el contexto y leer |
| `invented_precision` | agrega un número que nadie dijo | recordar que ese dato no apareció |
| `role_shift` | quién declaró la necesidad | saber quién habló |
| `clause_collapse` | mete dos obligaciones en una | notar que son cosas distintas |

**No toda acción distinta de aceptar es una detección.** En la cita desplazada
el texto del requisito es correcto y lo falso es la evidencia: editar la
redacción mejora el enunciado y deja la cita intacta, así que una edición no
demuestra haber contrastado el turno. En los otros tres el defecto está en el
texto y editarlo lo corrige.

| Tipo | Cuenta como detección |
| --- | --- |
| `citation_drift` | sólo rechazar |
| `invented_precision` | editar o rechazar |
| `role_shift` | editar o rechazar |
| `clause_collapse` | editar o rechazar |

Salió de la primera corrida con dos revisores: los dos editaron una cita
desplazada sin tocarla. Contadas como detecciones, la tasa habría sido del
100% para un defecto que ninguno advirtió. Las métricas reportan las dos
cifras —aceptadas y no detectadas— porque la primera es la medición cruda y
permite reconstruir la segunda.

Los tipos rotan para que el revisor no aprenda un patrón: si todos fueran
iguales, a la tercera iteración se mediría aprendizaje y no vigilancia. Cada
propuesta guarda su `defect_kind` y una nota de qué se alteró, así el análisis
reporta «detectó el 80% de las citas movidas y el 40% de las precisiones
inventadas» en vez de una tasa sola.

Es determinista: la misma semilla produce la misma inyección. **La semilla y
la proporción van en el informe.**

Se niega a inyectar dos veces sobre la misma iteración —cambiaría la
proporción sin registro— y a inyectar sobre una iteración que ya tiene
decisiones, porque dejaría esas decisiones apuntando a un texto que el revisor
nunca vio.

**Esto convierte una corrida observacional en un experimento.** Hay que
declarar en el informe que la cola contenía propuestas fabricadas, cuántas y
de qué tipo; si no, los resultados se leen como si el agente hubiera producido
esos errores.

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

### Audio

La pantalla de Captura sube el archivo de verdad: `POST /meetings/{id}/audio`,
multipart, con validación de formato y tope de 500 MB. El tamaño se controla
mientras se escribe, no por el encabezado `Content-Length`, que el cliente
puede mentir.

El archivo va al disco —`ECHOREQ_AUDIO_DIR`, por defecto `api/storage/audio`—
y la base guarda dónde está, cuánto pesa y su **SHA-256**. El hash no es
adorno: permite comprobar que el audio del que salió una transcripción es el
mismo que se grabó, sin confiar en el nombre del archivo.

El consentimiento se registra con `POST /meetings/{id}/consent` y se escribe
una sola vez: `consent_at` no se pisa, así que la fecha guardada es la de
cuando se dio realmente.

Una reunión también puede tener turnos cargados directo en la base, sin haber
pasado por el pipeline. La pantalla lo dice así —«turnos cargados a mano»— en
vez de mostrar el procesamiento como completo.

### Transcripción

Del audio a los turnos citables, en la máquina del investigador:

```bash
make asr                              # instala la pila, una sola vez (~1,5 GB)
export HF_TOKEN=hf_...                # token de HuggingFace
make transcribe M=mi-proyecto-r1
```

Corre en su propio entorno, `api/.venv-asr`, y como proceso aparte del
servidor. Las dos cosas por el mismo motivo: sin GPU, cuarenta minutos de
audio son decenas de minutos de trabajo y cientos de megabytes de modelos
residentes. Eso no entra en una petición HTTP ni tiene por qué instalarse para
levantar la API. La interfaz no llama a nada: lee `transcription_status` de la
base y muestra en qué anda.

El audio tiene que entrar en 16 kHz mono. Desde un MP4 de cámara:

```bash
ffmpeg -i reunion.mp4 -vn -ac 1 -ar 16000 -c:a pcm_s16le reunion.wav
```

**No se usa WhisperX**: fija `ctranslate2==4.4.0`, que no tiene wheel para
Python 3.14. El pipeline usa sus dos piezas por separado —faster-whisper para
el texto, pyannote para las voces— lo que además evita cargar el modelo de
alineación forzada, que da tiempos por palabra cuando acá se cita por turno.
La diarización necesita aceptar las condiciones de
`pyannote/speaker-diarization-community-1` en HuggingFace y un token de
lectura en `HF_TOKEN`. Es ese repo y no `speaker-diarization-3.1`: pyannote 4.x
redirige el segundo al primero, así que pedir el viejo dejaría registrado en la
procedencia un modelo que no fue el que corrió.

Las decisiones que importan para el estudio:

- **`temperature=0` y sin escalones de reintento.** Por defecto el modelo sube
  la temperatura cuando desconfía de su salida, y eso vuelve irreproducible
  justo el tramo difícil.
- **`condition_on_previous_text=False`.** Da algo menos de coherencia, pero
  impide que en una grabación larga el modelo entre en bucle y repita una
  frase durante minutos. Una alucinación acá terminaría citada como evidencia
  de un requisito.
- **Se transcribe una sola vez.** `turns` es de solo anexado: una decisión ya
  registrada puede citar el turno 44, y rehacer la transcripción reasignaría
  ese número a otro tramo del audio sin que nada lo delate.
- **Queda la procedencia.** `transcription_model`, `transcription_params` y
  `transcribed_at`, por el mismo motivo que existe `llm_calls`. El estudio
  compara la reunión 1 contra la 5: si el transcriptor cambió en el medio, la
  deriva medida deja de ser la de los requisitos.

Un turno agrupa tramos seguidos del mismo hablante separados por menos de dos
segundos, y se corta a los 45. Las dos reglas hacen falta: en habla espontánea
las pausas de dos segundos casi no aparecen, así que el silencio solo dejaba
turnos de minutos enteros. Verificado sobre audio real —35 tramos del modelo
quedaban en un único turno de dos minutos.

El tope sale de para qué sirve el turno. El revisor lo lee entero para
verificar una propuesta; pasados unos tres cuartos de minuto deja de leer y
empieza a confiar. Esa confianza por agotamiento es justo lo que el estudio
mide, así que el instrumento no puede inducirla.

Los hablantes salen como `S1`, `S2`. La diarización distingue voces, no
personas: separa cuántas hay y cuándo habló cada una, pero no puede saber cuál
es el cliente.

### Quién es cada voz

En la pantalla de Sesiones, una vez transcripta la reunión, se escucha un
recorte de cada voz y se la identifica. El servidor recorta el fragmento con
ffmpeg —doce segundos pesan 384 KB contra los 74 MB del archivo entero— y la
etiqueta se guarda en `speaker_labels`.

Va aparte de `turns` porque son dos afirmaciones de distinto origen. Que la
voz de un tramo sea la 00 lo observó el modelo, y por eso `turns` es de solo
anexado. Que esa voz sea la del especialista lo interpretó una persona
escuchando: puede estar equivocada y tiene que poder corregirse sin tocar el
registro de lo que el modelo observó.

**No es cosmético.** La etiqueta entra en el prompt de generación:

```
[3] 00:49 Analista entrevistador: ¿usted qué cargo desempeña ahora mismo?
[4] 00:58 Especialista UGEL: hasta el año pasado yo estuve como especialista…
```

Sin ella el agente lee `S1` y `S2`, y no puede distinguir **un requisito que
el cliente pidió de una idea que el entrevistador introdujo al preguntar**.
Con ella puede, y la regla 5 del prompt le pide marcar con una señal las
propuestas cuya idea no salió del cliente.

**Se reconocen entre reuniones.** La diarización numera las voces por orden de
aparición en cada audio, así que el `S2` de una reunión no es el `S2` de la
siguiente. Guardar el centroide que pyannote ya calcula permite comparar una
voz nueva contra las conocidas del proyecto y proponer a quién se parece, con
su porcentaje de similitud.

Se propone y no se aplica. Quién habla decide si un requisito lo pidió el
cliente o lo sugirió el entrevistador, y eso entra al prompt del agente: una
identificación automática equivocada contaminaría esa señal sin dejar rastro.
El umbral es alto por la misma razón — una sugerencia floja invita a
confirmarla sin escuchar.

Para las reuniones transcriptas antes de que esto existiera:

```bash
make voices M=<meeting_id>
```

Corre sólo la diarización, sin repetir el reconocimiento de voz. Como esa
segunda pasada numera las voces por su cuenta, sus etiquetas se traducen a los
códigos ya guardados por solapamiento temporal contra los turnos, que es lo
único que las dos pasadas comparten.

El rol y el nombre son campos separados porque tienen destinos distintos:

| | Va al prompt | Va a las exportaciones | Para qué |
| --- | --- | --- | --- |
| **Rol** | sí | sí | que el agente distinga quién pide de quién pregunta |
| **Nombre** | no | no | que el analista sepa a quién escuchó |

Con un solo campo libre, la frontera dependía de la disciplina de quien
escribe: alcanzaba con teclear «Cristian Salwa, especialista» para meter un
nombre propio en cada llamada al modelo y en cada CSV de la tesis. Separarlos
la convierte en estructura — `labels_for` consulta `role` y nunca `name`.

La transcripción sí puede contener nombres, porque la gente se presenta
hablando. Eso es otro problema y se resuelve al anonimizar el corpus, no acá.

Cada voz lleva además un tono propio en la transcripción, para distinguir de un
vistazo que cambió quien habla. Los cuatro tonos se eligieron con el validador
de paletas categóricas comparando **todos los pares**, no solo los vecinos: en
una transcripción los turnos aparecen en cualquier orden. Pasan el piso de
visión normal en claro y en oscuro (ΔE 18,2 y 16,5 contra un mínimo de 15), el
piso de croma y el contraste contra la superficie.

El par teal↔rosa queda por debajo del umbral de deuteranopia, y es admisible
sólo porque el color nunca porta la identidad solo: cada turno lleva el código
de la voz y el rol escritos al lado. Son cuatro y no seis porque con seis el
piso de visión normal se cae; una quinta voz cae al neutro en lugar de recibir
un tono inventado.

Los tonos de estado quedaron fuera de esa paleta a propósito: jade es aceptar,
ámbar es señal de calidad y carmesí es conflicto. Un hablante pintado de ámbar
competiría con un significado que ya está tomado.

### Corrección de decisiones

Las decisiones son inmutables y la pantalla de Revisión no pide confirmación
—pedirla sumaría tiempo a la medición—, así que un clic accidental dejaría un
dato contaminado sin arreglo.

Una corrección se **anexa** en `decision_corrections`. No borra ni modifica la
decisión original: sigue en la exportación con su intervalo, marcada como
`corrected` junto a `intended_action` y `correction_reason`. Queda fuera de
las métricas por iteración, que la cuentan aparte.

Tres frenos para que corregir no funcione como un deshacer —si corregir fuera
gratis, el revisor decidiría más rápido sabiendo que puede volver atrás, y eso
contamina la medición en la dirección contraria:

- el motivo es obligatorio y se guarda;
- una decisión se corrige una sola vez;
- la interfaz solo ofrece corregir la decisión inmediatamente anterior, así
  que no se puede reescribir la historia después de ver qué vino.

La tasa de corrección es en sí misma una medida de confiabilidad del
instrumento y se exporta como tal.

### Inmutabilidad

`requirement_revisions`, `review_decisions`, `llm_calls` y `turns` son de solo
anexado, y la restricción se hace cumplir con triggers en la base, no por
convención del código. Un `UPDATE` accidental sobre una decisión de revisión
destruiría datos que no se pueden reconstruir. La única vía de reinicio es
`TRUNCATE`, y solo sobre una base de prueba.

## Participantes

Quién revisa se elige en la barra superior y queda siempre a la vista. No es
decoración: cada decisión se atribuye a quien esté seleccionado ahí, y
`review_decisions` es de solo anexado, así que una atribución equivocada no se
corrige después.

El alta es desde la misma barra —nombre y rol— y el identificador sale del
nombre: `p-ana-quispe`. Queda en cada decisión y en las exportaciones, así que
se prefiere legible a opaco.

**El bloqueo de una propuesta es por persona**, no por propuesta:

```sql
UNIQUE (proposal_id, participant_id)
```

Dos revisores sobre la misma cola producen dos series independientes, que es
lo que permite comparar entre personas. También es la vía para rehacer una
corrida cuyo registro salió mal, sin borrar nada ni volver a procesar el audio:
se da de alta otro participante y la cola aparece completa.

Cambiar de participante reinicia las pantallas que llevan estado de revisión.
La cola es de la persona, no del proyecto.

## Proyectos

La aplicación entra por la lista de proyectos. Un proyecto es el workspace de
un sistema cuya especificación se mantiene a lo largo de sus reuniones: todo
lo demás —reuniones, propuestas, decisiones, métricas— cuelga de uno.

Al crearlo se definen tres cosas:

| Campo | Para qué |
| --- | --- |
| Nombre | Identifica el workspace. El identificador sale de ahí, sin acentos, porque aparece en las URLs y en los nombres de los CSV exportados. |
| Dominio | Qué sistema es. Entra en el prompt de generación, así el agente distingue un requisito de una conversación en ese dominio. |
| Formato | `user-story` o `ieee830`. Se fija una vez para todo el proyecto. |

**El formato no se elige por reunión.** La cadena que se mide usa uno solo:
cada formato se evalúa con criterios de calidad distintos, y mezclarlos haría
incomparables las curvas de deriva.

### Reuniones

Se crean desde el proyecto, pidiendo solo nombre y fecha. **La iteración y el
modo no se eligen: los deriva el servidor.** La primera reunión de un proyecto
es de descubrimiento porque no hay documento contra el cual comparar; las
siguientes son de documentación viva.

Dejarlo a criterio de quien la crea permitiría una cadena con dos
descubrimientos, o con ninguno, y la curva de deriva dejaría de significar lo
mismo.

El identificador lleva el proyecto adentro —`clinica-norte-r4`— porque
`m-<fecha>` colisionaba entre proyectos y entre dos reuniones del mismo día.

El último proyecto abierto se reabre solo. Va en `localStorage` y no en la
URL, al revés que la sección: un enlace a un requisito tiene que poder
compartirse, pero en qué proyecto estaba trabajando cada uno es contexto
personal.

## Color

La paleta es [Radix Colors](https://www.radix-ui.com/colors): escalas de 12
pasos con rol asignado —1-2 fondos, 3-5 componentes interactivos, 6-8 bordes,
9-10 sólidos, 11-12 texto— y su par de modo oscuro ya afinado.

| Escala | Para qué |
| --- | --- |
| `sage` | Neutros gris verdosos |
| `jade` | Acento |
| `amber` | Advertencias |
| `crimson` | Conflictos y rechazos |

`src/styles/tokens.css` mapea esos pasos a tokens semánticos —`--ink`, `--ok`,
`--line`— y los componentes usan solo esos. Cambiar de escala es tocar ese
archivo y nada más; no quedan hexadecimales sueltos fuera de él.

Dos reglas que el sistema hace explícitas y antes se mezclaban:

- **El paso 9 es sólido, el 11 es texto.** Un mismo valor para las dos cosas
  lee apagado como relleno y flojo como texto. Por eso hay `--ok` y
  `--ok-text` separados.
- **Los estados salen de pasos, no de filtros.** El hover es `--ok-hover`
  (paso 10), no `filter: brightness()`.

`amber` merece una advertencia: su paso 9 es un amarillo pensado para llevar
texto oscuro encima, y sobre fondo claro mide 1.49:1. Sirve como relleno,
nunca como borde ni como trazo — para eso va el paso de texto.

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

Del lado de la API, la transcripción sigue la misma separación que el resto:

```
api/
  transcribe.py                          CLI, corre con .venv-asr
  app/requirements/
    domain/transcription.py              qué es un turno, atribución de voces
    transcribe.py                        reglas: una sola vez, con audio
  app/adapters/
    transcription/local_engine.py        faster-whisper + pyannote
    persistence/transcript_store.py      turnos, estado y procedencia
```

La segmentación en turnos y la atribución de hablantes viven en el dominio, no
en el adaptador: son reglas del estudio y se prueban sin torch instalado.

Cada pantalla sigue container-presentational: el contenedor tiene el estado,
los componentes de `components/` son puros.

## Concordancia entre revisores

Las decisiones son por persona: el bloqueo de una propuesta es
`UNIQUE (proposal_id, participant_id)`, así que la misma cola produce tantas
series independientes como revisores haya. Por eso las cifras de decisión se
piden por participante — promediar dos series devuelve una mediana que no es
de nadie.

La pantalla de Concordancia las cruza: qué decidió cada uno sobre cada
propuesta, y cuáles los dividieron. Eso es lo que justifica tener más de un
revisor. Una propuesta que todos deciden igual y otra que los divide dicen
cosas distintas sobre la propuesta, y esa distinción no existe con una sola
serie.

**No ofrece unificar las decisiones, a propósito.** El desacuerdo es la
observación; resolverlo desde la pantalla borraría el dato que vino a
registrar. Cuál versión queda en el documento ya lo decide otra regla: la
escribe quien decide primero, y por eso se designa un analista de referencia.

Un defecto sembrado que divide a los revisores es un defecto difícil, y esa
cifra se muestra aparte.

## Restricciones de instrumentación

La pantalla de Revisión produce los datos del estudio. Estas reglas no son
preferencias de diseño y **no pueden cambiarse durante una corrida**:

- **Una propuesta por vez.** El intervalo `presented_at` → `decided_at` es la
  medición de registro. Abrir el editor no reinicia el reloj.
- **Cada propuesta lleva su propio reloj.** Un instante compartido por toda la
  pantalla convierte la latencia en tiempo transcurrido desde que se abrió, que
  crece solo y no mide ninguna decisión. Ya se rompió una vez sin que nada
  avisara, así que ahora hay una comprobación: `make instrument` maneja las dos
  pantallas en un navegador real, intercepta las decisiones sin escribirlas y
  falla si dos comparten reloj.
- **El editor no arrastra el borrador.** Guardar una edición y avanzar dejaba
  el editor abierto con el texto anterior, y la propuesta siguiente quedaba
  registrada con una edición que el revisor nunca escribió para ella. Cubierto
  por la misma comprobación.
- **La latencia solo se compara dentro del mismo modo.** En descubrimiento los
  candidatos se muestran todos juntos y el revisor entra y sale de ellos, así
  que el intervalo mide cuánto estuvo uno al frente. La curva de la pantalla de
  Iteraciones excluye esas iteraciones en lugar de promediarlas con las de
  documentación viva.
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
