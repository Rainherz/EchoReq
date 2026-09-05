import { useState } from "react";
import { createMeeting } from "../../adapters/api/client";
import type { Meeting } from "../../adapters/api/client";

/** Fecha y hora de hoy en el formato que espera `datetime-local`. */
function nowForInput(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

interface NewMeetingProps {
  projectId: string;
  participantId: string;
  /** Iteración que le va a tocar. Se deriva, no se elige. */
  nextIteration: number;
  onCreated: (meeting: Meeting) => void;
  onCancel?: () => void;
}

/**
 * Alta de una reunión.
 *
 * Solo se piden el nombre y la fecha. La iteración y el modo los deriva el
 * servidor: la primera reunión de un proyecto es de descubrimiento porque no
 * hay documento contra el cual comparar, y las siguientes son de
 * documentación viva. Dejarlo a criterio de quien la crea permitiría una
 * cadena con dos descubrimientos, o con ninguno, y la curva de deriva
 * dejaría de significar lo mismo.
 */
export function NewMeeting({
  projectId,
  participantId,
  nextIteration,
  onCreated,
  onCancel,
}: NewMeetingProps) {
  const [label, setLabel] = useState("");
  const [heldAt, setHeldAt] = useState(nowForInput);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const discovery = nextIteration === 1;

  const submit = async () => {
    setSaving(true);
    setFailure(null);
    try {
      onCreated(
        await createMeeting(projectId, {
          label,
          heldAt: new Date(heldAt).toISOString(),
          participantId,
        }),
      );
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  };

  return (
    <form
      className="card newmeeting"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="card__head">
        Nueva reunión
        <span className="card__count">
          será la iteración {nextIteration} ·{" "}
          {discovery ? "descubrimiento" : "documentación viva"}
        </span>
      </div>

      <label className="label" htmlFor="nm-label">
        Nombre
      </label>
      <input
        id="nm-label"
        className="field"
        value={label}
        autoFocus
        placeholder={discovery ? "Relevamiento inicial" : "Seguimiento"}
        onChange={(event) => setLabel(event.target.value)}
      />

      <label className="label newmeeting__spaced" htmlFor="nm-date">
        Cuándo fue
      </label>
      <input
        id="nm-date"
        className="field newmeeting__date"
        type="datetime-local"
        value={heldAt}
        onChange={(event) => setHeldAt(event.target.value)}
      />

      <p className="newmeeting__hint">
        {discovery
          ? "Es la primera del proyecto, así que va en modo descubrimiento: el agente genera el primer borrador en lugar de proponer cambios sobre un documento que todavía no existe."
          : "Va en modo documentación viva: el agente compara lo dicho contra la especificación vigente y propone altas, modificaciones y conflictos."}
      </p>

      {failure && <p className="newmeeting__failure">{failure}</p>}

      <div className="decide">
        <button
          type="submit"
          className="btn btn--primary"
          disabled={saving || label.trim().length < 2}
        >
          {saving ? "Creando…" : "Crear reunión"}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
