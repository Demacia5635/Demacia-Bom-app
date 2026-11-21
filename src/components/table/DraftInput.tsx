import { useEffect, useRef, useState } from "react";

interface DraftInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'> {
    value: string | number | undefined | null;
    /**
     * Called once with the final text when the edit ends (blur, Enter, Tab,
     * arrow out), only if it changed. Returning false rejects it: the cell
     * goes back to its value.
     */
    onCommit: (text: string) => boolean | void;
}

/**
 * Text cell that keeps its own draft while focused and hands the value to the
 * table only when the edit ends. Committing on every keystroke re-sorted and
 * re-rendered the whole table per key, which moved rows mid-edit, dropped
 * focus (and the select-on-focus then replaced the text) and made typing lag.
 * Escape cancels the edit.
 */
export default function DraftInput({ value, onCommit, onKeyDown, onFocus, ...rest }: DraftInputProps) {
    const external = value == null ? '' : String(value);
    const [draft, setDraft] = useState(external);
    const editingRef = useRef(false);
    const cancelledRef = useRef(false);

    // Follow outside changes (refresh, publish, sort) unless the user is typing.
    useEffect(() => {
        if (!editingRef.current) setDraft(external);
    }, [external]);

    return (
        <input
            {...rest}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => {
                editingRef.current = true;
                cancelledRef.current = false;
                onFocus?.(e);
            }}
            onBlur={() => {
                editingRef.current = false;
                if (cancelledRef.current) {
                    setDraft(external);
                    return;
                }
                if (draft !== external && onCommit(draft) === false) setDraft(external);
            }}
            onKeyDown={(e) => {
                if (e.key === 'Escape') {
                    cancelledRef.current = true;
                    setDraft(external);
                    e.currentTarget.blur();
                    return;
                }
                onKeyDown?.(e);
            }}
        />
    );
}
