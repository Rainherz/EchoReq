import { diffSegments } from "../../domain/textDiff";

interface ProposalDiffProps {
  before?: string;
  after?: string;
  beforeLabel: string;
  afterLabel: string;
  /**
   * Mark the changed span. Off for conflicts, where the two texts are not
   * revisions of one another and a diff would be meaningless.
   */
  diff?: boolean;
}

/** Side-by-side requirement text with the changed span marked. */
export function ProposalDiff({
  before,
  after,
  beforeLabel,
  afterLabel,
  diff = true,
}: ProposalDiffProps) {
  const { removed, added } =
    diff && before && after
      ? diffSegments(before, after)
      : { removed: [], added: [] };

  return (
    <div>
      {before && (
        <>
          <span className="diff__label">{beforeLabel}</span>
          <p className="diff__before">
            {removed.length > 0
              ? removed.map((seg, i) =>
                  seg.kind === "removed" ? (
                    <span key={i} className="diff__removed">
                      {seg.text}
                    </span>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  ),
                )
              : before}
          </p>
        </>
      )}

      {after && (
        <>
          <span
            className="diff__label"
            style={{ marginTop: before ? "0.65rem" : undefined }}
          >
            {afterLabel}
          </span>
          <p className="diff__after">
            {added.length > 0
              ? added.map((seg, i) =>
                  seg.kind === "added" ? (
                    <span key={i} className="diff__added">
                      {seg.text}
                    </span>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  ),
                )
              : after}
          </p>
        </>
      )}
    </div>
  );
}
