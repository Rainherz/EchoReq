import { useEffect, useState } from "react";
import { Waveform } from "./components/Waveform";
import { ParticipantList } from "./components/ParticipantList";
import type { Participant } from "./components/ParticipantList";
import "../review/review.css";
import "./capture.css";

const PARTICIPANTS: Participant[] = [
  { code: "CL", name: "Cliente · dirección médica", share: 0.52 },
  { code: "PO", name: "Product Owner", share: 0.31 },
  { code: "AN", name: "Analista", share: 0.17 },
];

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

const STAGE_MS = 900;

interface CaptureScreenProps {
  meetingLabel: string;
  date: string;
  onFinished?: () => void;
}

/**
 * Captura: la única pantalla que toca la reunión misma.
 *
 * Deliberadamente inerte. No hay copiloto en vivo ni sugerencias durante la
 * sesión: cualquier cosa que influya en lo que dicen los participantes
 * cambiaría la entrada que el estudio mide, y la deriva ya no podría
 * separarse de la influencia del asistente.
 */
export function CaptureScreen({ meetingLabel, date, onFinished }: CaptureScreenProps) {
  const [loaded, setLoaded] = useState(false);
  const [consent, setConsent] = useState(false);
  const [consentAt, setConsentAt] = useState<string | null>(null);
  const [stage, setStage] = useState(-1);

  const running = stage >= 0 && stage < STAGES.length;
  const finished = stage >= STAGES.length;
  const canProcess = loaded && consent && stage < 0;

  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => setStage((current) => current + 1), STAGE_MS);
    return () => window.clearTimeout(id);
  }, [running, stage]);

  useEffect(() => {
    if (finished) onFinished?.();
  }, [finished, onFinished]);

  const toggleConsent = () => {
    setConsent((current) => {
      const next = !current;
      setConsentAt(
        next
          ? new Date().toLocaleString("es-AR", {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : null,
      );
      return next;
    });
  };

  return (
    <div className="capture">
      <div className="screen__head">
        <span className="screen__title">{meetingLabel}</span>
        <span className="screen__meta">{date}</span>
        <span className="screen__ops">
          <button type="button" className="btn btn--small">
            Descartar
          </button>
          <button
            type="button"
            className="btn btn--small btn--primary"
            disabled={!canProcess}
            onClick={() => setStage(0)}
          >
            {finished ? "Procesada" : running ? "Procesando…" : "Procesar reunión"}
          </button>
        </span>
      </div>

      {/* Los pasos van numerados porque la captura es una secuencia real: sin
          audio no hay qué consentir, y sin consentimiento no se procesa. */}
      <Step index={1} title="Audio de la sesión" done={loaded}>
        {loaded ? (
          <>
            <Waveform />
            <div className="audio__meta">
              <button type="button" className="btn btn--small">
                ▶ Reproducir
              </button>
              <button
                type="button"
                className="btn btn--small"
                onClick={() => setLoaded(false)}
              >
                Quitar
              </button>
              <span className="audio__file">
                reunion-01.m4a · 42:18 · 38 MB
              </span>
            </div>
          </>
        ) : (
          <div className="dropzone">
            <p className="dropzone__text">
              Arrastrá el archivo acá, o grabá directamente.
              <br />
              <span className="dropzone__formats">
                mp3, m4a, wav · también sirve la exportación de Meet o Zoom
              </span>
            </p>
            <div className="audio__meta">
              <button
                type="button"
                className="btn btn--small btn--primary"
                onClick={() => setLoaded(true)}
              >
                Subir archivo
              </button>
              <button type="button" className="btn btn--small">
                Grabar ahora
              </button>
            </div>
          </div>
        )}
      </Step>

      <Step index={2} title="Consentimiento" done={consent} blocked={!loaded}>
        <button
          type="button"
          className="consent"
          aria-pressed={consent}
          onClick={toggleConsent}
          disabled={!loaded}
        >
          <span className={consent ? "consent__box consent__box--on" : "consent__box"}>
            ✓
          </span>
          <span>
            Los participantes fueron informados de que la sesión se graba y
            transcribe con fines del estudio, y prestaron su consentimiento.
            {consent && consentAt && (
              <span className="consent__stamp">
                registrado {consentAt} · {PARTICIPANTS.length} participantes
              </span>
            )}
          </span>
        </button>
        {!consent && (
          <p className="step__hint">
            Sin consentimiento registrado no se habilita el procesamiento.
          </p>
        )}
      </Step>

      {/* Las etapas se muestran antes de procesar, no solo durante: hay que
          poder saber qué va a pasar antes de apretar el botón. */}
      <Step
        index={3}
        title="Procesamiento"
        done={finished}
        count={
          finished
            ? "completo"
            : running
              ? `${stage + 1} de ${STAGES.length}`
              : `${STAGES.length} etapas`
        }
      >
        {STAGES.map((item, position) => {
          const state =
            position < stage ? "done" : position === stage ? "active" : "pending";
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
      </Step>

      {finished && (
        <Step index={4} title="Hablantes detectados" done>
          <ParticipantList participants={PARTICIPANTS} ready />
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
  const classes = [
    "step",
    done ? "step--done" : "",
    blocked ? "step--blocked" : "",
  ]
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
