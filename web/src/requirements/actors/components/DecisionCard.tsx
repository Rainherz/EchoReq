import { useId, useState } from "react";
import type { FormEvent } from "react";
import type { ActorOutcome, GlossaryActor } from "../../../adapters/api/client";
import type { ActorRow } from "../lib/actors";

interface DecisionCardProps {
  row: ActorRow;
  glossary: GlossaryActor[];
  saving: boolean;
  onRecord: (outcome: ActorOutcome, role: string | null) => Promise<void>;
  onOpenRequirement: (requirementId: string) => void;
}

/**
 * Un nombre sin decidir, con su decisión al lado.
 *
 * Las tres opciones contestan la misma pregunta —«qué representa este
 * nombre»— para que sean comparables. Una que clasificara y otra que juzgara
 * calidad obligarían a elegir entre cosas que no compiten.
 *
 * La evidencia va adentro de la tarjeta y no detrás de un clic: quien decide
 * necesita ver en qué requisitos aparece y qué dice la definición del rol
 * candidato, y mandarlo a otra pantalla convierte ocho decisiones en
 * dieciséis pasos.
 */
export function DecisionCard({
  row,
  glossary,
  saving,
  onRecord,
  onOpenRequirement,
}: DecisionCardProps) {
  const group = useId();
  const [outcome, setOutcome] = useState<ActorOutcome | null>(null);
  // El rol candidato viene elegido: es la respuesta que la herramienta ya
  // dedujo, y confirmarla tiene que costar un clic, no dos.
  const [role, setRole] = useState(row.candidate?.name ?? "");
  const [invalid, setInvalid] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (outcome === null) {
      setInvalid("Elegí qué representa este nombre.");
      return;
    }
    if (outcome === "same" && role.trim().length === 0) {
      setInvalid("Decir que es el mismo rol necesita decir cuál.");
      return;
    }
    setInvalid(null);
    await onRecord(outcome, outcome === "new" ? null : role.trim() || null);
  };

  const options: { value: ActorOutcome; label: string; hint: string }[] = [
    {
      value: "same",
      label: "Es el mismo rol, escrito distinto",
      hint: "El requisito tendrá que decir el nombre declarado.",
    },
    {
      value: "new",
      label: "Es un rol propio que faltaba declarar",
      hint: "Se agrega al glosario con este nombre.",
    },
    {
      value: "wrong",
      label: "El requisito nombra al actor equivocado",
      hint: "No es un problema de vocabulario sino de contenido.",
    },
  ];

  return (
    <article className="decision">
      <div className="decision__about">
        <div className="decision__head">
          <h3 className="decision__name">{row.name}</h3>
          <span className="decision__uses">
            {row.requirements.length}{" "}
            {row.requirements.length === 1 ? "requisito" : "requisitos"}
          </span>
        </div>

        <div className="actor__reqs">
          {row.requirements.map((id) => (
            <button
              key={id}
              type="button"
              className="actor__req"
              onClick={() => onOpenRequirement(id)}
            >
              {id}
            </button>
          ))}
        </div>

        {row.candidate ? (
          <p className="decision__hint">
            Parece coincidir con <strong>{row.candidate.name}</strong>
            {row.candidate.description && `: «${row.candidate.description}»`}
          </p>
        ) : (
          <p className="decision__hint">Sin correspondencia en el glosario.</p>
        )}
      </div>

      <form className="decision__form" onSubmit={submit}>
        <fieldset className="decision__options">
          <legend className="label">¿Qué representa este nombre?</legend>
          {options.map((option) => (
            <label key={option.value} className="decision__option">
              <input
                type="radio"
                name={group}
                value={option.value}
                checked={outcome === option.value}
                onChange={() => {
                  setOutcome(option.value);
                  setInvalid(null);
                }}
              />
              <span>
                {option.label}
                <span className="decision__optionHint">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {(outcome === "same" || outcome === "wrong") && (
          <label className="decision__field">
            <span className="label">
              {outcome === "same" ? "Qué rol es" : "Qué rol correspondería"}
            </span>
            <select
              className="field"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="">
                {outcome === "wrong" ? "todavía no se sabe" : "elegí un rol"}
              </option>
              {glossary.map((declared) => (
                <option key={declared.name} value={declared.name}>
                  {declared.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {invalid && (
          <p className="resolve__error" role="alert">
            {invalid}
          </p>
        )}

        <button
          type="submit"
          className="btn btn--small btn--primary"
          disabled={saving}
        >
          {saving ? "Guardando…" : "Registrar decisión"}
        </button>
      </form>
    </article>
  );
}
