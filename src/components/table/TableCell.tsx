import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";
import { AuthenticatedImage } from "../AuthenticatedImage";
import type { CellValue, ColumnConfig, RowData } from "../Table";
import DraftInput from "./DraftInput";
import type { RenderRow } from "./visibleRows";

interface TableCellProps<T extends RowData> {
    row: RenderRow<T>;
    col: ColumnConfig<T>;
    rowIndex: number;
    colIndex: number;
    /** Rows this cell spans (merged cells, mergeKey). */
    span: number;
    isRowParent: boolean;
    /** A row filter is on: expanding and collapsing is off. */
    filtering: boolean;
    /** Frozen-column and drop-indicator classes. */
    className: string;
    style: CSSProperties | undefined;
    onToggleExpand: (rowId: string, e: MouseEvent) => void;
    onCellChange: (rowId: string, col: ColumnConfig<T>, value: CellValue) => void;
    /** A number cell's edit ended; false rejects the text. */
    onNumberCommit: (rowId: string, col: ColumnConfig<T>, text: string) => boolean;
    onCellKeyDown: (e: KeyboardEvent, rowIndex: number, colIndex: number) => void;
    onShowProblem: (cell: HTMLElement, text: string) => void;
    onHideProblem: () => void;
}

/**
 * One cell of a Table row: the first column's expand toggle and indent, and
 * the column's editor by type (select, button, image, checkbox, number or
 * text). Problem cells show their tooltip on hover / focus.
 */
export default function TableCell<T extends RowData>({
    row, col, rowIndex, colIndex, span, isRowParent, filtering, className, style,
    onToggleExpand, onCellChange, onNumberCommit, onCellKeyDown, onShowProblem, onHideProblem,
}: TableCellProps<T>) {
    const isCellDisabled = col.isDisabled ? col.isDisabled(row) : false;
    const value = (row as unknown as Record<string, unknown>)[col.key];
    const displayValue = value as string | number;
    const cellProblem = col.problem?.(row);

    return (
        <td
            data-col-key={col.key}
            rowSpan={span > 1 ? span : undefined}
            style={style}
            onMouseEnter={cellProblem ? (e) => onShowProblem(e.currentTarget, cellProblem) : undefined}
            onMouseLeave={cellProblem ? () => onHideProblem() : undefined}
            onFocus={cellProblem ? (e) => onShowProblem(e.currentTarget, cellProblem) : undefined}
            onBlur={cellProblem ? () => onHideProblem() : undefined}
            className={`table-td ${className} ${isCellDisabled ? 'cell-disabled' : ''} ${col.isModified?.(row) ? 'cell-modified' : ''} ${cellProblem ? 'cell-problem' : ''}`}>
            <div className="td-content-wrapper" style={colIndex === 0 ? { paddingLeft: `${row.level * 24}px` } : {}}>
                {colIndex === 0 && isRowParent && (
                    <button
                        className="expand-toggle"
                        onClick={(e) => onToggleExpand(row.id, e)}
                        disabled={filtering}
                        aria-label={row.open ? 'Collapse' : 'Expand'}
                        aria-expanded={row.open}
                        title={filtering ? 'Clear the search to expand or collapse' : undefined}
                    >
                        {row.open ? '▼' : '▶'}
                    </button>
                )}
                {colIndex === 0 && !isRowParent && <span className="expand-placeholder" />}

                {col.type === 'select' ? (
                    <select
                        data-row={rowIndex}
                        data-col={colIndex}
                        // Always controlled: an empty value shows the placeholder.
                        value={displayValue ?? ''}
                        onChange={(e) => onCellChange(row.id, col, e.target.value)}
                        onKeyDown={(e) => onCellKeyDown(e, rowIndex, colIndex)}
                        onClick={(e) => e.stopPropagation()}
                        className={`cell-input cell-select ${col.valueClass?.(displayValue) ?? ''}`}
                        disabled={isCellDisabled}
                    >
                        <option value="" disabled>Select...</option>
                        {(col.rowOptions?.(row) ?? col.options)?.map((option) => (
                            <option key={option} value={option}>{option}</option>
                        ))}
                    </select>
                ) : col.type === 'button' ? (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            col.onButtonClick?.(row);
                        }}
                        disabled={isCellDisabled}
                        className="mx-auto px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {col.buttonText || "Action"}
                    </button>
                ) : col.type === 'image' ? (
                    (() => (
                        <div className="w-8 h-8 rounded overflow-hidden bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0 my-1">
                            <AuthenticatedImage
                                src={value as string}
                                alt={col.label || "Image"}
                                className="w-full h-full object-cover" />
                        </div>
                    ))()

                ) : col.type === 'boolean' ? (
                    <input
                        type="checkbox"
                        checked={!!value}
                        onChange={(e) => onCellChange(row.id, col, e.target.checked)}
                        className="cell-checkbox"
                        disabled={isCellDisabled}
                    />
                ) : col.type === 'number' ? (
                    <DraftInput
                        data-row={rowIndex}
                        data-col={colIndex}
                        type="text"
                        inputMode={col.key === 'quantity' || col.key === 'revision' ? 'numeric' : 'decimal'}
                        value={displayValue}
                        onCommit={(text) => onNumberCommit(row.id, col, text)}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.currentTarget.blur();
                            } else {
                                onCellKeyDown(e, rowIndex, colIndex);
                            }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="cell-input"
                        disabled={isCellDisabled}
                    />
                ) : (
                    <DraftInput
                        data-row={rowIndex}
                        data-col={colIndex}
                        type="text"
                        value={displayValue}
                        onCommit={(text) => onCellChange(row.id, col, text)}
                        placeholder={col.placeholder?.(row)}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => onCellKeyDown(e, rowIndex, colIndex)}
                        onClick={(e) => e.stopPropagation()}
                        className="cell-input"
                        disabled={isCellDisabled}
                    />
                )}
            </div>
        </td>
    );
}

