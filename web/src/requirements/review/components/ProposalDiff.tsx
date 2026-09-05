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

/**
 * Requirement text before and after, side by side.
 *
 * Two columns rather than stacked: a requirement that has been accumulating
 * clauses for several iterations is long, and comparing two long paragraphs
 * separated by vertical distance means holding the first one in your head
 * while reading the second.
 */
export function ProposalDiff({
  before,
  after,
  beforeLabel,
  afterLabel,
  diff = true,
}: ProposalDiffProps) {
  const { removed, added } =
    diff && before && after ? diffSegments(before, after) : { removed: [], added: [] };

  const single = !before || !after;
  const changed = diff && added.some((segment) => segment.kind === "added");

  return (
    <>
      <div className={single ? "diffpair diffpair--single" : "diffpair"}>
        {before && (
          <div className="diffpair__col">
            <span className="diffpair__label">{beforeLabel}</span>
            <p className="diffpair__text diffpair__text--before">
              {removed.length > 0
                ? removed.map((segment, i) =>
                    segment.kind === "removed" ? (
                      <span key={i} className="diff__removed">
                        {segment.text}
                      </span>
                    ) : (
                      <span key={i}>{segment.text}</span>
                    ),
                  )
                : before}
            </p>
          </div>
        )}

        {after && (
          <div className="diffpair__col">
            <span className="diffpair__label">{afterLabel}</span>
            <p className="diffpair__text">
              {added.length > 0
                ? added.map((segment, i) =>
                    segment.kind === "added" ? (
                      <span key={i} className="diff__added">
                        {segment.text}
                      </span>
                    ) : (
                      <span key={i}>{segment.text}</span>
                    ),
                  )
                : after}
            </p>
          </div>
        )}
      </div>

      {changed && (
        <p className="diffpair__legend">
          <span className="diffpair__swatch" aria-hidden="true" />
          inserción propuesta
        </p>
      )}
    </>
  );
}
