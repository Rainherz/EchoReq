import { useState } from "react";
import type { ReviewAction } from "../../domain/types";

export interface LastDecision {
  decisionId: number;
  proposalId: string;
  targetId: string;
  action: ReviewAction;
}

const ACTION_LABEL: Record<ReviewAction, string> = {
  accept: "aceptada",
  edit: "editada",
  reject: "rechazada",
};

const OPTIONS: ReviewAction[] = ["accept", "edit", "reject"];

interface CorrectLastProps {
  last: LastDecision;
  onCorrect: (intended: ReviewAction, reason: string) => Promise<void>;
}

/**
 * Corrección de la decisión inmediatamente anterior.
 *
 * Existe porque las decisiones son inmutables y no hay confirmación antes de
 * registrarlas —agregarla sumaría tiempo a la medición—, así que un clic
 * accidental dejaría un dato contaminado sin arreglo.
 *
 * Solo se ofrece sobre la última decisión: si se pudiera corregir cualquiera,
 * el revisor podría reescribir su historia después de ver qué vino, que es
 * otra forma de contaminar lo mismo. El motivo es obligatorio: es la fricción
 * que separa un error de clic real de un deshacer por comodidad.
 *
 * La corrección no toca la decisión original ni reabre la propuesta. Se anexa.
 */
export function CorrectLast({ last, onCorrect }: CorrectLastProps) {
  const [open, setOpen] = useState(false);
  const [intended, setIntended] = useState<ReviewAction>("reject");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p className="correct__done">
        Corrección registrada sobre {last.targetId}. La decisión original queda
        en los datos, marcada.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="correct__open"
        onClick={() => setOpen(true)}
      >
        ¿Te equivocaste? Corregir la anterior ({last.targetId},{" "}
        {ACTION_LABEL[last.action]})
      </button>
    );
  }

  const submit = async () => {
    setSaving(true);
    setFailure(null);
    try {
      await onCorrect(intended, reason);
      setDone(true);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  };

  return (
    <div className="correct">
      <p className="correct__head">
        Corregir {last.targetId}, que quedó {ACTION_LABEL[last.action]}
      </p>

      <div className="correct__row">
        <span className="correct__label">Quería</span>
        {OPTIONS.filter((option) => option !== last.action).map((option) => (
          <button
            key={option}
            type="button"
            className="btn btn--chip"
            aria-pressed={intended === option}
            onClick={() => setIntended(option)}
          >
            {ACTION_LABEL[option]}
          </button>
        ))}
      </div>

      <label className="correct__label" htmlFor="correct-reason">
        Motivo
      </label>
      <input
        id="correct-reason"
        className="field"
        value={reason}
        placeholder="Qué pasó. Queda en los datos del estudio."
        onChange={(event) => setReason(event.target.value)}
      />

      {failure && <p className="correct__failure">{failure}</p>}

      <div className="decide">
        <button
          type="button"
          className="btn btn--small btn--primary"
          disabled={saving || reason.trim().length < 3}
          onClick={submit}
        >
          {saving ? "Guardando…" : "Registrar corrección"}
        </button>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
