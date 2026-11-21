import type { ProblemTipState } from "./useProblemTip";

/** The tooltip of a problem cell, under the cell (see useProblemTip). */
export default function ProblemTip({ tip }: { tip: ProblemTipState | null }) {
    if (!tip) return null;
    return (
        <div className="cell-problem-tip" role="tooltip" style={{ left: tip.left, top: tip.top }}>
            {tip.text}
        </div>
    );
}
