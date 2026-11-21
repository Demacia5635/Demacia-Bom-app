import { useEffect, useState } from "react";

export interface ProblemTipState {
    text: string;
    left: number;
    top: number;
}

/**
 * Tooltip of a problem cell, drawn by the table (ProblemTip): the browser's own
 * title tooltip is slow, and doesn't show over the cell's input in the
 * extension panel. It doesn't follow its cell, so scrolling hides it.
 */
export function useProblemTip() {
    const [problemTip, setProblemTip] = useState<ProblemTipState | null>(null);
    const showProblemTip = (cell: HTMLElement, text: string) => {
        const r = cell.getBoundingClientRect();
        const left = Math.max(8, Math.min(r.left, window.innerWidth - 288));
        setProblemTip({ text, left, top: r.bottom + 4 });
    };
    useEffect(() => {
        if (!problemTip) return;
        const hide = () => setProblemTip(null);
        window.addEventListener('scroll', hide, true);
        return () => window.removeEventListener('scroll', hide, true);
    }, [problemTip]);
    return { problemTip, showProblemTip, hideProblemTip: () => setProblemTip(null) };
}
