import { useState } from "react";
import type { Participant } from "../adapters/api/client";
import { createParticipant } from "../adapters/api/client";

/** Iniciales para la insignia. Dos letras alcanzan para distinguir. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

interface ParticipantPickerProps {
  participants: Participant[];
  selectedId: string | null;
  onSelect: (participantId: string) => void;
  onCreated: (participant: Participant) => void;
}

/**
 * Quién está revisando.
 *
 * Vive en la barra superior y siempre a la vista, no escondido en un menú:
 * cada decisión se atribuye a quien esté elegido acá, y una atribución
 * equivocada no se puede corregir después —`review_decisions` es de solo
 * anexado— así que el dato tiene que estar delante todo el tiempo.
 *
 * Cambiar de participante reinicia la cola: la misma propuesta vuelve a
 * aparecer sin decidir, porque el bloqueo es por persona.
 */
export function ParticipantPicker({
  participants,
  selectedId,
  onSelect,
  onCreated,
}: ParticipantPickerProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("analista");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const selected = participants.find((p) => p.id === selectedId) ?? null;

  const submit = async () => {
    setSaving(true);
    setFailure(null);
    try {
      const created = await createParticipant({ displayName: name, role });
      setAdding(false);
      setName("");
      onCreated(created);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  if (adding) {
    return (
      <form
        className="identity identity--form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <input
          className="field field--inline"
          value={name}
          autoFocus
          placeholder="Nombre de quien revisa"
          onChange={(event) => setName(event.target.value)}
        />
        <input
          className="field field--inline field--narrow"
          value={role}
          placeholder="Rol"
          onChange={(event) => setRole(event.target.value)}
        />
        <button
          type="submit"
          className="btn btn--small btn--primary"
          disabled={saving || name.trim().length < 2 || role.trim().length < 2}
        >
          {saving ? "…" : "Alta"}
        </button>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => {
            setAdding(false);
            setFailure(null);
          }}
        >
          Cancelar
        </button>
        {failure && <span className="identity__failure">{failure}</span>}
      </form>
    );
  }

  return (
    <label className="identity">
      <span className="picker__label">Revisa</span>
      <select
        className="picker__select"
        value={selectedId ?? ""}
        onChange={(event) => {
          if (event.target.value === "__nuevo__") {
            setAdding(true);
            return;
          }
          onSelect(event.target.value);
        }}
      >
        {participants.map((participant) => (
          <option key={participant.id} value={participant.id}>
            {participant.displayName} · {participant.role}
            {participant.decisions > 0
              ? ` — ${participant.decisions} decisiones`
              : ""}
          </option>
        ))}
        <option value="__nuevo__">+ Nuevo participante…</option>
      </select>
      <span
        className="avatar"
        title={selected ? `${selected.displayName} · ${selected.role}` : "Sin participante"}
      >
        {selected ? initials(selected.displayName) : "··"}
      </span>
    </label>
  );
}
