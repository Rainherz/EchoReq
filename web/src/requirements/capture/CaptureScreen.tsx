import { useRef, useState } from "react";
import type { Meeting } from "../../adapters/api/client";
import {
  recordConsent,
  uploadAudio,
  uploadTranscript,
} from "../../adapters/api/client";
import { FileDrop } from "./components/FileDrop";
import { SpeakerLabels } from "./components/SpeakerLabels";
import "../review/review.css";
import "./capture.css";

/** Etapas del pipeline de audio, en el orden en que corren. */
const STAGES = [
  {
    id: "transcribe",
    label: "Transcripción",
    detail: "El audio pasa a texto.",
    output: "faster-whisper",
  },
  {
    id: "diarize",
    label: "Diarización",
    detail: "Se separa quién dijo qué.",
    output: "pyannote",
  },
  {
    id: "segment",
    label: "Segmentación en turnos",
    detail: "Cada turno recibe el identificador que después se cita.",
    output: "turn_id",
  },
  {
    id: "analyze",
    label: "Análisis y propuestas",
    detail: "El agente compara lo dicho contra la especificación vigente.",
    output: "change_proposals",
  },
] as const;

/**
 * Etapas cuando la reunión trae su transcripción ya hecha.
 *
 * No hay transcripción ni diarización que correr: el archivo ya dice quién
 * habló. Lo que queda es leerlo y cortarlo en turnos citables.
 */
const IMPORT_STAGES = [
  {
    id: "import",
    label: "Importación",
    detail: "El archivo se guarda tal cual llegó, con su SHA-256.",
    output: "txt · vtt",
  },
  {
    id: "segment",
    label: "Segmentación en turnos",
    detail:
      "Cada racha de un mismo hablante es un turno, con el identificador que después se cita.",
    output: "turn_id",
  },
  STAGES[STAGES.length - 1],
] as const;

/** De dónde salen los turnos de la reunión. Es una o la otra, nunca las dos. */
type Source = "audio" | "transcript";

const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;

interface CaptureScreenProps {
  meeting: Meeting;
  /** Recarga la reunión desde la API después de un cambio. */
  onChanged: () => void;
  /** Abre el alta de una reunión nueva. */
  onAddMeeting: () => void;
}

/**
 * Captura: la única pantalla que toca la reunión misma.
 *
 * Deliberadamente inerte durante la sesión. No hay copiloto ni sugerencias en
 * vivo: cualquier cosa que influya en lo que dicen los participantes
 * cambiaría la entrada que el estudio mide, y la deriva ya no podría
 * separarse de la influencia del asistente.
 */
export function CaptureScreen({
  meeting,
  onChanged,
  onAddMeeting,
}: CaptureScreenProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<Source | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Source>("audio");

  const hasAudio = meeting.audioFilename !== null;
  const imported = meeting.transcriptFormat !== null;
  const hasTurns = meeting.turnCount > 0;
  // Turnos sin audio ni archivo importado significa que se cargaron directo
  // en la base, no que el pipeline los produjo. Decir "completo" ahí sería
  // atribuirle a la herramienta un trabajo que nadie hizo.
  const seeded = hasTurns && !hasAudio && !imported;
  // Una vez que hay audio o transcripción, la fuente ya no se elige: los
  // turnos son de solo anexado y salen de una sola.
  const source: Source = imported ? "transcript" : hasAudio ? "audio" : chosen;
  const sourceLocked = hasAudio || imported || seeded;
  const status = meeting.transcriptionStatus;
  const transcribed = (hasAudio || imported) && status === "done";
  const running = hasAudio && status === "running";
  const failed = hasAudio && status === "failed";
  // La generación ya corrió si dejó propuestas. No se mira cuántas quedan
  // pendientes: bajan a cero al terminar de revisar, y la pantalla volvería a
  // pedir que se genere algo que ya está.
  const analyzed = meeting.proposalCount > 0;

  const send = async (kind: Source, file: File) => {
    setUploading(kind);
    setFailure(null);
    try {
      await (kind === "audio"
        ? uploadAudio(meeting.id, file)
        : uploadTranscript(meeting.id, file));
      onChanged();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setUploading(null);
    }
  };

  const consent = async () => {
    setFailure(null);
    try {
      await recordConsent(meeting.id);
      onChanged();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    }
  };

  // Las etapas previas al análisis corren juntas: las del audio en una sola
  // pasada del CLI, las de la importación en la misma petición que sube el
  // archivo. No hay forma de saber en cuál está, así que mientras corre se
  // muestran todas activas: fingir un avance etapa por etapa sería inventarlo.
  const stages = source === "transcript" ? IMPORT_STAGES : STAGES;
  const prepStages = stages.length - 1;
  const stageState = (position: number): string => {
    if (position < prepStages) {
      if (transcribed) return "done";
      return running ? "active" : "pending";
    }
    // El análisis es un paso aparte, con su propio comando.
    if (analyzed) return "done";
    return transcribed ? "active" : "pending";
  };

  const processingCount = analyzed
    ? `${meeting.proposalCount} propuestas`
    : transcribed
    ? `${meeting.turnCount} turnos`
    : running
      ? "transcribiendo…"
      : failed
        ? "falló"
        : seeded
          ? "turnos cargados a mano"
          : hasAudio
            ? "pendiente"
            : `${stages.length} etapas`;

  return (
    <div className="capture">
      <div className="screen__head">
        <span className="screen__title">{meeting.label}</span>
        <span className="screen__meta">
          {new Date(meeting.heldAt).toLocaleString("es-AR", {
            dateStyle: "long",
            timeStyle: "short",
          })}
        </span>
        <span className="screen__ops">
          <button type="button" className="btn btn--small" onClick={onAddMeeting}>
            Nueva reunión
          </button>
        </span>
      </div>

      {failure && <p className="decide__failure">{failure}</p>}

      <Step
        index={1}
        title="Entrada de la sesión"
        done={hasAudio || imported || seeded}
      >
        <div className="source" role="radiogroup" aria-label="De dónde salen los turnos">
          {(
            [
              ["audio", "Audio de la sesión", "se transcribe acá"],
              ["transcript", "Transcripción ya hecha", ".vtt de Meet o Teams, o .txt"],
            ] as const
          ).map(([value, label, sub]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={source === value && !seeded}
              className={
                source === value && !seeded ? "source__opt source__opt--on" : "source__opt"
              }
              disabled={sourceLocked || uploading !== null}
              onClick={() => setChosen(value)}
            >
              {label}
              <span className="source__sub">{sub}</span>
            </button>
          ))}
        </div>
        <p className="step__hint">
          {sourceLocked
            ? "La fuente de los turnos ya está fijada. Para usar la otra, creá otra reunión."
            : "Son alternativas: los turnos de una reunión salen del audio o de la transcripción, no de los dos."}
        </p>

        {source === "audio" && !seeded && (
          <>
            <input
              ref={fileInput}
              type="file"
              accept=".mp3,.m4a,.wav,.ogg,.flac,.webm,audio/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void send("audio", file);
                event.target.value = "";
              }}
            />

            {hasAudio ? (
              <div className="audio__loaded">
                <span className="audio__badge">
                  {meeting.audioFilename?.split(".").pop()?.toUpperCase()}
                </span>
                <span>
                  <strong>{meeting.audioFilename}</strong>
                  <span className="audio__sub">
                    {meeting.audioBytes ? formatBytes(meeting.audioBytes) : ""}
                    {meeting.turnCount > 0 && ` · ${meeting.turnCount} turnos`}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn--small"
                  disabled={uploading !== null}
                  onClick={() => fileInput.current?.click()}
                >
                  Reemplazar
                </button>
              </div>
            ) : (
              <FileDrop
                accept=".mp3,.m4a,.wav,.ogg,.flac,.webm,audio/*"
                formats="mp3, m4a, wav, ogg, flac o webm · hasta 500 MB"
                prompt="Arrastrá el archivo acá."
                busyLabel="Subiendo…"
                busy={uploading === "audio"}
                disabled={uploading !== null}
                onFile={(file) => void send("audio", file)}
              />
            )}
          </>
        )}

        {source === "transcript" &&
          (imported ? (
            <div className="audio__loaded">
              <span className="audio__badge">
                {meeting.transcriptFormat?.toUpperCase()}
              </span>
              <span>
                <strong>{meeting.transcriptFilename}</strong>
                <span className="audio__sub">
                  {meeting.turnCount} turnos · guardado con su SHA-256 · no se
                  reemplaza: los turnos son de solo anexado
                </span>
              </span>
            </div>
          ) : (
            <>
              <FileDrop
                accept=".txt,.vtt,text/plain,text/vtt"
                formats="«Hablante: texto» por línea en .txt, o .vtt con hablantes · hasta 5 MB"
                prompt="Arrastrá la transcripción acá."
                busyLabel="Importando…"
                busy={uploading === "transcript"}
                disabled={uploading !== null || !meeting.hasConsent}
                onFile={(file) => void send("transcript", file)}
              />
              {!meeting.hasConsent && (
                <p className="step__hint">
                  Primero el consentimiento (paso 2): importar ya escribe los
                  turnos, y sin consentimiento la sesión no se procesa.
                </p>
              )}
            </>
          ))}
      </Step>

      <Step
        index={2}
        title="Consentimiento"
        done={meeting.hasConsent}
        blocked={!hasAudio && source !== "transcript"}
      >
        <button
          type="button"
          className="consent"
          aria-pressed={meeting.hasConsent}
          onClick={consent}
          disabled={(!hasAudio && source !== "transcript") || meeting.hasConsent}
        >
          <span
            className={
              meeting.hasConsent ? "consent__box consent__box--on" : "consent__box"
            }
          >
            ✓
          </span>
          <span>
            Los participantes fueron informados de que la sesión se graba y
            transcribe con fines del estudio, y prestaron su consentimiento.
            {meeting.hasConsent && (
              <span className="consent__stamp">
                registrado · queda en la base con su fecha
              </span>
            )}
          </span>
        </button>
        {!meeting.hasConsent && (
          <p className="step__hint">
            Se registra una sola vez y no se puede deshacer desde la interfaz.
          </p>
        )}
      </Step>

      <Step
        index={3}
        title="Procesamiento"
        done={transcribed}
        blocked={!meeting.hasConsent}
        count={processingCount}
      >
        {stages.map((item, position) => {
          const state = stageState(position);
          return (
            <div key={item.id} className={`stage stage--${state}`}>
              <span className="stage__mark">✓</span>
              <span>
                {item.label}
                <span className="stage__detail">{item.detail}</span>
              </span>
              <span className="stage__out">{item.output}</span>
            </div>
          );
        })}

        {failed && meeting.transcriptionError && (
          <p className="decide__failure">{meeting.transcriptionError}</p>
        )}

        {seeded && (
          <p className="step__hint">
            Esta reunión tiene {meeting.turnCount} turnos cargados directamente
            en la base, sin pasar por el pipeline. No hay audio asociado.
          </p>
        )}

        {!hasAudio && !imported && !seeded && (
          <p className="step__hint">
            {source === "transcript"
              ? "Importá la transcripción para habilitar el procesamiento."
              : "Cargá el audio para habilitar el procesamiento."}
          </p>
        )}

        {hasAudio && !transcribed && !running && (
          <p className="step__hint">
            La transcripción corre aparte del servidor: sin GPU son decenas de
            minutos, y eso no entra en una petición. Desde <code>api/</code>:
            <br />
            <code>.venv-asr/bin/python transcribe.py {meeting.id}</code>
            <br />
            Esta pantalla refleja lo que diga la base, así que alcanza con
            recargarla.
          </p>
        )}

        {running && (
          <p className="step__hint">
            Transcribiendo. Recargá para ver si terminó. Los turnos se escriben
            todos juntos al final, así que este estado también queda si la
            corrida se interrumpió: volver a lanzarla la retoma desde cero.
          </p>
        )}

        {transcribed && !analyzed && (
          <p className="step__hint">
            {meeting.turnCount} turnos listos para citar. El análisis es el
            siguiente paso, desde <code>api/</code>:
            <br />
            <code>.venv/bin/python generate.py {meeting.id} --project …</code>
          </p>
        )}

        {analyzed && (
          <p className="step__hint">
            {meeting.proposalCount} propuestas generadas sobre {meeting.turnCount}{" "}
            turnos.{" "}
            {meeting.pendingProposals > 0
              ? `Quedan ${meeting.pendingProposals} sin decidir en Revisión.`
              : "Todas decididas."}
          </p>
        )}
      </Step>

      {hasTurns && (
        <Step index={4} title="Quién es cada voz" done={false}>
          <SpeakerLabels
            meetingId={meeting.id}
            onChanged={onChanged}
            canPlay={hasAudio}
          />
        </Step>
      )}
    </div>
  );
}

function Step({
  index,
  title,
  done,
  blocked = false,
  count,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  blocked?: boolean;
  count?: string;
  children: React.ReactNode;
}) {
  const classes = ["step", done ? "step--done" : "", blocked ? "step--blocked" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes}>
      <div className="step__head">
        <span className="step__index">{done ? "✓" : index}</span>
        <span className="step__title">{title}</span>
        {count && <span className="step__count">{count}</span>}
      </div>
      <div className="step__body">{children}</div>
    </section>
  );
}
