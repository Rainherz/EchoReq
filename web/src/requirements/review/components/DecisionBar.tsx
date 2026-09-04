import { useState } from "react";
import type { ReviewAction } from "../../domain/types";

interface DecisionBarProps {
  proposedContent?: string;
  onDecide: (action: ReviewAction, editedContent?: string) => void;
}

/**
 * The three decisions, and nothing else.
 *
 * Two deliberate omissions, both of which would corrupt the measurement:
 *
 * - No bulk "accept all". It would record the presence of a shortcut rather
 *   than the reviewer's vigilance.
 * - No keyboard shortcuts. An accelerator lowers the cost of approving far
 *   more than the cost of reading, which measures ergonomics instead of
 *   attention.
 *
 * Neither may be added while a study run is in progress.
 */
export function DecisionBar({ proposedContent, onDecide }: DecisionBarProps) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft !== null) {
    return (
      <div>
        <label className="diff__label" htmlFor="proposal-editor">
          Texto corregido
        </label>
        <textarea
          id="proposal-editor"
          className="editor"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="decide">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => onDecide("edit", draft)}
          >
            Guardar y continuar
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setDraft(null)}
          >
            Cancelar
          </button>
        </div>
        <p className="decide__note">
          El cronómetro sigue corriendo: se mide desde que se mostró la
          propuesta, no desde que se abrió el editor.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="decide">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onDecide("accept")}
        >
          Aceptar
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setDraft(proposedContent ?? "")}
        >
          Editar
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => onDecide("reject")}
        >
          Rechazar
        </button>
      </div>
      <p className="decide__note">
        Una propuesta por vez. Sin aceptar en lote y sin atajos de teclado.
      </p>
    </div>
  );
}
