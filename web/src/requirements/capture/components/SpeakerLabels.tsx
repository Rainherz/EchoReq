import { useEffect, useRef, useState } from "react";
import type { Speaker } from "../../../adapters/api/client";
import { clipUrl, fetchSpeakers, labelSpeaker } from "../../../adapters/api/client";

/** Sugerencias de rol. Se ofrece el rol antes que el nombre propio a
    propósito: le da al agente el mismo contexto sin convertir la
    transcripción en datos identificados de las personas entrevistadas. */
const ROLES = [
  "Analista entrevistador",
  "Cliente",
  "Especialista",
  "Directivo",
];

interface SpeakerLabelsProps {
  meetingId: string;
  /** Avisa cuando cambió una etiqueta, para refrescar los contadores. */
  onChanged?: () => void;
}

/**
 * Quién es cada voz.
 *
 * La diarización distingue voces, no personas: separa cuántas hay y cuándo
 * habló cada una, pero no puede saber cuál es el cliente. Esa parte la pone
 * una persona escuchando.
 *
 * No es cosmética. La etiqueta entra en el prompt de generación, y sin ella
 * el agente no puede distinguir un requisito que el cliente pidió de una idea
 * que el entrevistador introdujo al preguntar.
 */
export function SpeakerLabels({ meetingId, onChanged }: SpeakerLabelsProps) {
  const [speakers, setSpeakers] = useState<Speaker[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSpeakers(meetingId)
      .then((rows) => {
        if (cancelled) return;
        setSpeakers(rows);
        setDrafts(
          Object.fromEntries(rows.map((r) => [r.code, r.label ?? ""])),
        );
      })
      .catch((cause: unknown) =>
        setFailure(cause instanceof Error ? cause.message : String(cause)),
      );
    return () => {
      cancelled = true;
      audio.current?.pause();
    };
  }, [meetingId]);

  const play = (code: string, start: number, end: number) => {
    audio.current?.pause();
    const clip = new Audio(clipUrl(meetingId, start, Math.max(end - start, 3)));
    audio.current = clip;
    const key = `${code}-${start}`;
    setPlaying(key);
    clip.onended = () => setPlaying(null);
    clip.onerror = () => {
      setPlaying(null);
      setFailure("No se pudo reproducir el recorte.");
    };
    void clip.play();
  };

  const save = async (code: string) => {
    const label = (drafts[code] ?? "").trim();
    if (label.length < 2) return;
    setSaving(code);
    setFailure(null);
    try {
      await labelSpeaker(meetingId, code, label);
      setSpeakers((current) =>
        current?.map((s) => (s.code === code ? { ...s, label } : s)) ?? null,
      );
      onChanged?.();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(null);
    }
  };

  if (speakers === null) {
    return <p className="step__hint">Cargando voces…</p>;
  }

  const named = speakers.filter((s) => s.label).length;

  return (
    <div>
      {failure && <p className="decide__failure">{failure}</p>}

      {speakers.map((speaker) => (
        <div key={speaker.code} className="voice">
          <div className="voice__head">
            <span className={`speaker speaker--${speaker.code}`}>
              {speaker.code}
            </span>
            <span className="voice__meta">
              {speaker.turns} turnos · {Math.round(speaker.characters / 100) / 10}k
              caracteres
            </span>
            <span className="voice__samples">
              {speaker.samples.map((sample) => {
                const key = `${speaker.code}-${sample.startSeconds}`;
                return (
                  <button
                    key={sample.turnId}
                    type="button"
                    className={
                      playing === key ? "btn btn--small btn--primary" : "btn btn--small"
                    }
                    title={sample.text.slice(0, 120)}
                    onClick={() =>
                      play(speaker.code, sample.startSeconds, sample.endSeconds)
                    }
                  >
                    {playing === key ? "♪" : "▶"} {sample.startsAt}
                  </button>
                );
              })}
            </span>
          </div>

          <p className="voice__quote">“{speaker.samples[0]?.text.slice(0, 190)}…”</p>

          <form
            className="voice__form"
            onSubmit={(event) => {
              event.preventDefault();
              void save(speaker.code);
            }}
          >
            <input
              className="field field--inline"
              list={`roles-${speaker.code}`}
              value={drafts[speaker.code] ?? ""}
              placeholder="Quién es esta voz"
              onChange={(event) =>
                setDrafts((d) => ({ ...d, [speaker.code]: event.target.value }))
              }
            />
            <datalist id={`roles-${speaker.code}`}>
              {ROLES.map((role) => (
                <option key={role} value={role} />
              ))}
            </datalist>
            <button
              type="submit"
              className="btn btn--small"
              disabled={
                saving === speaker.code ||
                (drafts[speaker.code] ?? "").trim().length < 2 ||
                (drafts[speaker.code] ?? "").trim() === speaker.label
              }
            >
              {saving === speaker.code
                ? "…"
                : speaker.label
                  ? "Corregir"
                  : "Guardar"}
            </button>
          </form>
        </div>
      ))}

      <p className="step__hint">
        {named === speakers.length ? (
          <>
            Las {speakers.length} voces están identificadas. El agente va a
            poder distinguir quién pide de quién pregunta.
          </>
        ) : (
          <>
            {named} de {speakers.length} identificadas. Las que falten llegan al
            agente como código, y ahí no puede distinguir un requisito que el
            cliente pidió de una idea que el entrevistador sugirió.
          </>
        )}{" "}
        Conviene el rol antes que el nombre propio: da el mismo contexto sin
        convertir la transcripción en datos identificados.
      </p>
    </div>
  );
}
