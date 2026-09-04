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

/** Pipeline stages, in the order the backend will run them. */
const STAGES = [
  { id: "transcribe", label: "Transcripción", output: "WhisperX" },
  { id: "diarize", label: "Diarización de hablantes", output: "pyannote" },
  { id: "segment", label: "Segmentación en turnos", output: "turn_id estable" },
  { id: "analyze", label: "Análisis y propuestas", output: "change_proposals" },
] as const;

const STAGE_MS = 900;

interface CaptureScreenProps {
  meetingLabel: string;
  date: string;
  onFinished?: () => void;
}

/**
 * Capture: the only screen that touches the meeting itself.
 *
 * Deliberately inert. There is no live copilot and no in-meeting suggestion:
 * anything that shapes what participants say would change the input the study
 * measures downstream, and the drift signal could no longer be separated from
 * the assistant's influence on the conversation.
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
            style={canProcess ? undefined : { opacity: 0.45, cursor: "not-allowed" }}
            onClick={() => setStage(0)}
          >
            {finished ? "Procesada" : running ? "Procesando…" : "Procesar reunión"}
          </button>
        </span>
      </div>

      <div className="capture__split">
        <div className="card">
          <div className="card__head">
            Audio de la sesión
            <span className="card__count">{loaded ? "42:18" : "sin cargar"}</span>
          </div>

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
                <span className="audio__file">reunion-01.m4a · 38 MB</span>
              </div>
            </>
          ) : (
            <>
              <p className="audio__empty">
                Arrastrá el archivo acá, o grabá directamente.
                <br />
                Formatos: mp3, m4a, wav. También sirve la exportación de Meet o Zoom.
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
            </>
          )}
        </div>

        <div className="card">
          <div className="card__head">
            Participantes
            <span className="card__count">{finished ? PARTICIPANTS.length : "—"}</span>
          </div>
          <ParticipantList participants={PARTICIPANTS} ready={finished} />
        </div>
      </div>

      <div className="card">
        <div className="card__head">Consentimiento</div>
        <button
          type="button"
          className="consent"
          aria-pressed={consent}
          onClick={toggleConsent}
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
          <p className="consent__blocked">
            Sin consentimiento registrado no se habilita el procesamiento.
          </p>
        )}
      </div>

      {stage >= 0 && (
        <div className="card">
          <div className="card__head">
            Procesamiento
            <span className="card__count">
              {finished ? "completo" : `${stage + 1} de ${STAGES.length}`}
            </span>
          </div>
          {STAGES.map((item, position) => {
            const state =
              position < stage ? "done" : position === stage ? "active" : "pending";
            return (
              <div key={item.id} className={`stage stage--${state}`}>
                <span className="stage__mark">✓</span>
                <span>{item.label}</span>
                <span className="stage__out">{item.output}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
