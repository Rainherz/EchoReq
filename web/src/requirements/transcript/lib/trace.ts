import type { MeetingProposal } from "../../../adapters/api/client";

/** Qué está resaltado: una propuesta (y sus turnos) o un turno (y sus
    propuestas). Un solo foco a la vez: dos resaltados simultáneos obligan a
    adivinar cuál lleva a cuál. */
export type Focus =
  | { kind: "proposal"; id: string }
  | { kind: "turn"; id: number }
  | null;

/** Turno → propuestas que lo citan, en el orden en que llegan. */
export function citersByTurn(
  proposals: MeetingProposal[],
): Map<number, MeetingProposal[]> {
  const map = new Map<number, MeetingProposal[]>();
  for (const proposal of proposals) {
    for (const turnId of proposal.sourceTurnIds) {
      map.set(turnId, [...(map.get(turnId) ?? []), proposal]);
    }
  }
  return map;
}

/** Turnos y propuestas que quedan resaltados para un foco. */
export function highlighted(
  focus: Focus,
  proposals: MeetingProposal[],
  citers: Map<number, MeetingProposal[]>,
): { turns: Set<number>; proposals: Set<string> } {
  if (focus === null) return { turns: new Set(), proposals: new Set() };
  if (focus.kind === "proposal") {
    const found = proposals.find((p) => p.id === focus.id);
    return {
      turns: new Set(found?.sourceTurnIds ?? []),
      proposals: new Set([focus.id]),
    };
  }
  return {
    turns: new Set([focus.id]),
    proposals: new Set((citers.get(focus.id) ?? []).map((p) => p.id)),
  };
}

/** «12 s» o «1 min 29 s». */
export function formatSeconds(seconds: number): string {
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole} s`;
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}
