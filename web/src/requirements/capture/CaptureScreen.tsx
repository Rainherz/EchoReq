import { useRef, useState } from "react";
import type { Meeting } from "../../adapters/api/client";
import { recordConsent, uploadAudio } from "../../adapters/api/client";
import "../review/review.css";
import "./capture.css";

/** Etapas del pipeline, en el orden en que corren. */
const STAGES = [
  {
    id: "transcribe",
    label: "Transcripción",
    detail: "El audio pasa a texto.",
    output: "WhisperX",
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

const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;

interface CaptureScreenProps {
  meeting: Meeting;
  /** Recarga la reunión desde la API después de un cambio. */
  onChanged: () => void;
}

/**
 * Captura: la única pantalla que toca la reunión misma.
 *
 * Deliberadamente inerte durante la sesión. No hay copiloto ni sugerencias en
 * vivo: cualquier cosa que influya en lo que dicen los participantes
 * cambiaría la entrada que el estudio mide, y la deriva ya no podría
 * separarse de la influencia del asistente.
 */
export function CaptureScreen({ meeting, onChanged }: CaptureScreenProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const hasAudio = meeting.audioFilename !== null;
  const hasTurns = meeting.turnCount > 0;
  // Turnos sin audio significa que se cargaron directo en la base, no que el
  // pipeline los produjo. Decir "completo" ahí sería atribuirle a la
  // herramienta un trabajo que nadie hizo.
  const seeded = hasTurns && !hasAudio;
  const transcribed = hasAudio && meeting.transcriptionStatus === "done";

  const send = async (file: File) => {
    setUploading(true);
    setFailure(null);
    try {
      await uploadAudio(meeting.id, file);
      onChanged();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setUploading(false);
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

  // Índice de la etapa en curso. Sin transcripción implementada todas quedan
  // pendientes: mostrarlas avanzando sería mentir sobre lo que pasó.
  const activeStage = transcribed ? STAGES.length : -1;

  const processingCount = transcribed
    ? "completo"
    : seeded
      ? "turnos cargados a mano"
      : hasAudio
        ? "pendiente"
        : `${STAGES.length} etapas`;

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
      </div>

      {failure && <p className="decide__failure">{failure}</p>}

      <Step index={1} title="Audio de la sesión" done={hasAudio}>
        <input
          ref={fileInput}
          type="file"
          accept=".mp3,.m4a,.wav,.ogg,.flac,.webm,audio/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void send(file);
            event.target.value = "";
          }}
        />

        {hasAudio ? (
          <>
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
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
              >
                Reemplazar
              </button>
            </div>
          </>
        ) : (
          <div
            className={dragging ? "dropzone dropzone--over" : "dropzone"}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void send(file);
            }}
          >
            <p className="dropzone__text">
              {uploading ? "Subiendo…" : "Arrastrá el archivo acá."}
              <br />
              <span className="dropzone__formats">
                mp3, m4a, wav, ogg, flac o webm · hasta 500 MB
              </span>
            </p>
            <div className="audio__meta">
              <button
                type="button"
                className="btn btn--small btn--primary"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? "Subiendo…" : "Elegir archivo"}
              </button>
            </div>
          </div>
        )}
      </Step>

      <Step
        index={2}
        title="Consentimiento"
        done={meeting.hasConsent}
        blocked={!hasAudio}
      >
        <button
          type="button"
          className="consent"
          aria-pressed={meeting.hasConsent}
          onClick={consent}
          disabled={!hasAudio || meeting.hasConsent}
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
        {STAGES.map((item, position) => {
          const state =
            position < activeStage
              ? "done"
              : position === activeStage
                ? "active"
                : "pending";
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

        {!transcribed && (
          <p className="step__hint">
            {seeded
              ? `Esta reunión tiene ${meeting.turnCount} turnos cargados directamente en la base, sin pasar por el pipeline. No hay audio asociado.`
              : hasAudio
                ? "El audio está cargado y verificado por su hash. La transcripción todavía no está implementada, así que las etapas siguen pendientes."
                : "Cargá el audio para habilitar el procesamiento."}
          </p>
        )}
      </Step>
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
