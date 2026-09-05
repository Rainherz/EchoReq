import type { Meeting } from "../adapters/api/client";

interface MeetingPickerProps {
  meetings: Meeting[];
  selectedId: string;
  onSelect: (meetingId: string) => void;
}

/**
 * Selector de la reunión sobre la que se trabaja.
 *
 * Vive en la barra superior porque es contexto global: la cola de revisión,
 * la transcripción y la revisión del documento que se ve dependen todas de
 * cuál está elegida.
 *
 * Cada opción muestra cuántas propuestas le quedan pendientes al
 * participante, que es lo que decide a cuál entrar.
 */
export function MeetingPicker({
  meetings,
  selectedId,
  onSelect,
}: MeetingPickerProps) {
  const selected = meetings.find((m) => m.id === selectedId);
  const pending = selected?.pendingProposals ?? 0;

  return (
    <label className="picker">
      <span className="picker__label">Reunión</span>
      <select
        className="picker__select"
        value={selectedId}
        onChange={(event) => onSelect(event.target.value)}
      >
        {meetings.map((meeting) => (
          <option key={meeting.id} value={meeting.id}>
            {meeting.iteration} · {meeting.label}
            {meeting.pendingProposals > 0
              ? ` — ${meeting.pendingProposals} pendientes`
              : ""}
          </option>
        ))}
      </select>
      {pending > 0 && (
        <span className="picker__badge" title="Propuestas sin decidir">
          {pending}
        </span>
      )}
    </label>
  );
}
