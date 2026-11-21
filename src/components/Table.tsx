import { useEffect, useMemo, useRef, useState } from "react";
import { useColumnResize } from "./table/useColumnResize";
import ProblemTip from "./table/ProblemTip";
import TableCell from "./table/TableCell";
import { useProblemTip } from "./table/useProblemTip";
import { useColumnReorder } from "./table/useColumnReorder";
import { useStickyFit } from "./table/useStickyFit";
import { useSyncedHScroll } from "./table/useSyncedHScroll";
import { filterMatches, groupChildren, mergedCellSpans, renderKeys, visibleRows } from "./table/visibleRows";

export interface RowData {
    id: string;
    parentId: string | null;
    isExpanded: boolean;
}

interface ContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    columnIndex: number;
}

export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
    key: any;
    direction: SortDirection;
}

export interface ColumnConfig {
    key: any;
    label: string;
    type: 'string' | 'number' | 'select' | 'boolean' | 'button' | 'image';
    buttonText?: string;
    onButtonClick?: (row: RowData & any) => void;
    options?: string[];
    isDisabled?: (row: RowData & any) => boolean;
    /** Highlights the cell (class "cell-modified"), e.g. for an edit not saved yet. */
    isModified?: (row: RowData & any) => boolean;
    /** Extra class for a select cell from its value (e.g. a status colour). */
    valueClass?: (value: any) => string | undefined;
    /** A problem with the cell's value: marks the cell (class "cell-problem") and shows the text on hover or focus. */
    problem?: (row: RowData & any) => string | undefined;
    /** Grey hint shown in an empty text cell (e.g. the value used if it stays empty). */
    placeholder?: (row: RowData & any) => string | undefined;
    /**
     * Merged cells, like Excel: consecutive shown rows with the same non-empty
     * key show this column as one cell spanning them (the first row's value).
     * An edit there changes only the first row; the page applies it to the rest.
     */
    mergeKey?: (row: RowData & any) => string | undefined;
}

interface TableParam {
    data: (RowData & any)[],
    columnsData: ColumnConfig[],
    newRowFunction: ((id: string, parentId: string | null) => RowData) | undefined,
    setData: (newData: RowData[]) => void,
    minLastColWidth?: number;
    defaultColWidth?: number;
    removeTopRow?: boolean;
    initialSort?: SortConfig;
    /** Keeps the header row visible while scrolling (the table scrolls inside its own box, sized to the window). */
    stickyHeader?: boolean;
    /** Number of leftmost columns kept visible while scrolling sideways (like Excel's freeze panes). */
    frozenColumns?: number;
    /**
     * Shows only rows this returns true for, plus the parents leading to them
     * (opened, whatever their expand state). Undefined shows everything.
     */
    rowFilter?: (row: RowData & any) => boolean;
    /** Rows this returns true for are left out (with anything under them); expanding works as usual. */
    hideRow?: (row: RowData & any) => boolean;
}

export const Table: React.FC<TableParam> = ({ data, columnsData, newRowFunction, setData, minLastColWidth = 120, defaultColWidth = 120, removeTopRow = false, initialSort, stickyHeader = false, frozenColumns = 0, rowFilter, hideRow }) => {

    const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, columnIndex: -1 });

    // Tooltip of a problem cell (table/useProblemTip.ts, drawn by ProblemTip).
    const { problemTip, showProblemTip, hideProblemTip } = useProblemTip();

    // Bottom scrollbar synced with the table (table/useSyncedHScroll.ts).
    const { wrapperRef, bottomScrollRef, tableWidth } = useSyncedHScroll();

    // Unchanged state when already closed: this runs on every scroll and click,
    // and a new object each time re-rendered the whole table.
    const closeContextMenu = () => setContextMenu(prev => (prev.visible ? { ...prev, visible: false } : prev));

    // The columns in the user's order, and dragging them (table/useColumnReorder.ts).
    const {
        columns,
        moveColumn,
        draggedIdx,
        isHandleDragging,
        setIsHandleDragging,
        handleDragStart,
        handleDragOver,
        handleDrop,
        resetDragState,
        getDropIndicatorClass,
    } = useColumnReorder(columnsData, () => closeContextMenu());
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(initialSort ?? null);

    // Sticky header: the box is sized to reach the bottom of the window (table/useStickyFit.ts).
    const fitHeight = useStickyFit(wrapperRef, stickyHeader);

    const contextMenuRef = useRef<HTMLDivElement>(null);

    // The column menu closes on a press anywhere outside it, also outside the
    // table (a click inside the table already closes it through the wrapper).
    useEffect(() => {
        if (!contextMenu.visible) return;
        const handlePointerDown = (e: PointerEvent) => {
            if (!contextMenuRef.current?.contains(e.target as Node)) closeContextMenu();
        };
        window.addEventListener('pointerdown', handlePointerDown, true);
        return () => window.removeEventListener('pointerdown', handlePointerDown, true);
    }, [contextMenu.visible]);


    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeContextMenu();
        };
        const handleScroll = () => closeContextMenu();

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('scroll', handleScroll, true);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, []);

    // Column widths: dragged, fitted, and the last one filling the table (table/useColumnResize.ts).
    const { columnWidths, setColumnWidths, autoLastColWidth, handleResizeStart } =
        useColumnResize(columns, wrapperRef, defaultColWidth, minLastColWidth);



    // Which rows show, in what order and with what spans (table/visibleRows.ts).
    const childrenByParent = useMemo(() => groupChildren(data), [data]);
    const filterSets = useMemo(() => (rowFilter ? filterMatches(data, rowFilter) : null), [data, rowFilter]);
    const visibleData = useMemo(
        () => visibleRows(childrenByParent, sortConfig, filterSets, hideRow),
        [childrenByParent, sortConfig, filterSets, hideRow]
    );
    const renderedRows = useMemo(
        () => visibleData.filter((_row, i) => !removeTopRow || i !== 0),
        [visibleData, removeTopRow]
    );
    const mergeSpans = useMemo(() => mergedCellSpans(columns, renderedRows), [columns, renderedRows]);
    const rowKeys = useMemo(() => renderKeys(visibleData), [visibleData]);
    const isParent = (id: string) => childrenByParent.has(id);

    // Fits a column to its longest shown value (double-click on its resize handle).
    const handleResizeDoubleClick = (e: React.MouseEvent, key: string, label: string) => {
        e.stopPropagation();
        let maxChars = label.length;
        visibleData.forEach(row => {
            const val = row[key as keyof typeof data[0]];
            const str = val !== null && val !== undefined ? String(val) : '';
            const indentChars = (columns[0].key === key ? row.level * 3 : 0);
            maxChars = Math.max(maxChars, str.length + indentChars);
        });

        const tightFitWidth = Math.ceil((maxChars * 7.5) + 32);
        setColumnWidths(prev => ({ ...prev, [key]: Math.max(70, tightFitWidth) }));
    };

    const handleAddRow = (parentId: string | null = null) => {
        const newId = Date.now().toString();
        if (!newRowFunction) return;
        const newRow = newRowFunction(newId, parentId);

        let newData = [...data, newRow];
        if (parentId !== null) newData = newData.map(row => row.id === parentId ? { ...row, isExpanded: true } : row);
        setData(newData);
        closeContextMenu();
    };

    const toggleExpand = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setData(data.map(row => row.id === id ? { ...row, isExpanded: !row.isExpanded } : row));
    };


    /** Width of the column at `idx` (the last one stretches to fill the table). */
    const colWidth = (col: ColumnConfig, idx: number): number => {
        const isLast = idx === columns.length - 1;
        return columnWidths[col.key] ?? (isLast && autoLastColWidth !== null ? autoLastColWidth : defaultColWidth);
    };

    // Frozen columns stick to the left; each one's offset is the width of those before it.
    const frozenCount = Math.min(frozenColumns, Math.max(columns.length - 1, 0));
    const frozenLeft: number[] = [];
    for (let i = 0, left = 0; i < frozenCount; i++) {
        frozenLeft.push(left);
        left += colWidth(columns[i], i);
    }
    const frozenClass = (idx: number) =>
        idx < frozenCount ? `cell-frozen${idx === frozenCount - 1 ? ' cell-frozen-last' : ''}` : '';
    const frozenStyle = (idx: number): React.CSSProperties | undefined =>
        idx < frozenCount ? { left: frozenLeft[idx] } : undefined;

    const handleCellChange = (rowId: string, col: ColumnConfig, rawValue: any) => {
        setData(
            data.map(row => {
                if (row.id !== rowId) return row;
                const updatedRow = { ...row };
                (updatedRow as any)[col.key] = rawValue;
                return updatedRow;
            }));
    };

    /**
     * Commits a number cell. Empty means 0. Text that isn't a whole number
     * (quantity, revision) or a plain decimal with a dot ("1.5", ".5", "2.")
     * is rejected and the cell goes back to its value, instead of being saved
     * as 0 or cut short ("1,5", "12g", "1e3").
     */
    const handleNumberBlur = (rowId: string, col: ColumnConfig, rawValue: string | number): boolean => {
        const strVal = String(rawValue).trim();
        if (strVal === '' || strVal === '.') {
            handleCellChange(rowId, col, '0');
            return true;
        }

        if (col.key === 'quantity' || col.key === 'revision') {
            if (!/^\d+$/.test(strVal)) return false;
            handleCellChange(rowId, col, String(parseInt(strVal, 10)));
            return true;
        }

        if (!/^-?(\d+\.?\d*|\.\d+)$/.test(strVal)) return false;
        handleCellChange(rowId, col, String(Number(strVal)));
        return true;
    };


    const handleSortClick = (e: React.MouseEvent, key: string) => {
        e.stopPropagation();
        setSortConfig(prev => {
            if (!prev || prev.key !== key) return { key, direction: 'asc' };
            if (prev.direction === 'asc') return { key, direction: 'desc' };
            return null;
        });
    };

    const handleContextMenu = (e: React.MouseEvent, key: string) => {
        e.preventDefault();
        const originalIndex = columns.findIndex(c => c.key === key);
        setContextMenu({ visible: true, x: e.clientX, y: e.clientY, columnIndex: originalIndex });
    };

    const handleCellKeyDown = (e: React.KeyboardEvent, rowIndex: number, colIndex: number) => {
        const target = e.currentTarget as HTMLInputElement | HTMLSelectElement;
        const isInput = target.tagName === 'INPUT';
        const input = target as HTMLInputElement;

        const isCtrl = e.ctrlKey;
        const isUp = e.key === 'ArrowUp';
        const isDown = e.key === 'ArrowDown';
        const isLeft = e.key === 'ArrowLeft';
        const isRight = e.key === 'ArrowRight';

        if (isUp || isDown) {
            e.preventDefault();
            const dRow = isUp ? -1 : 1;
            focusNextAvailableCell(rowIndex, colIndex, dRow, 0);
        } else if (isLeft) {
            if (isCtrl || (isInput && input.selectionStart === 0 && input.selectionEnd === 0)) {
                e.preventDefault();
                focusNextAvailableCell(rowIndex, colIndex, 0, -1);
            }
        } else if (isRight) {
            if (isCtrl || (isInput && input.selectionStart === input.value.length && input.selectionEnd === input.value.length)) {
                e.preventDefault();
                focusNextAvailableCell(rowIndex, colIndex, 0, 1);
            }
        } else if (e.key === 'Enter') {
            target.blur();
        }
    };

    const focusNextAvailableCell = (rIdx: number, cIdx: number, dRow: number, dCol: number) => {
        let targetRow = rIdx;
        let targetCol = cIdx;

        while (true) {
            targetRow += dRow;
            targetCol += dCol;

            if (targetRow < 0 || targetRow >= visibleData.length) break;
            if (targetCol < 0 || targetCol >= columns.length) break;

            // Only this table's cells (another table on the page uses the same indexes).
            const cellElement = wrapperRef.current?.querySelector(`[data-row="${targetRow}"][data-col="${targetCol}"]`) as HTMLInputElement | HTMLSelectElement | null | undefined;
            if (cellElement && !cellElement.disabled) {
                cellElement.focus();
                if (cellElement instanceof HTMLInputElement) {
                    if (dCol === 1) cellElement.setSelectionRange(0, 0);
                    else if (dCol === -1) cellElement.setSelectionRange(cellElement.value.length, cellElement.value.length);
                    else cellElement.select();
                }
                break;
            }
        }
    };

    return (
        <div className="" onClick={closeContextMenu}>
            {newRowFunction &&
                <div className="table-controls">
                    <button onClick={() => handleAddRow()}>+ Add Item</button>
                </div>
            }

            <div
                className={`table-wrapper ${stickyHeader ? 'table-wrapper-sticky' : ''}`}
                ref={wrapperRef}
                style={{
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    ...(stickyHeader && fitHeight !== null ? { maxHeight: `${fitHeight}px` } : {}),
                }}
            >
                <table className="custom-table">
                    <colgroup>
                        {columns.map((col, idx) => (
                            <col key={col.key} style={{ width: colWidth(col, idx) }} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            {columns.map((col, index) => (
                                <th
                                    key={col.key}
                                    draggable={isHandleDragging}
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDrop={() => handleDrop(index)}
                                    onDragEnd={resetDragState}
                                    onContextMenu={(e) => handleContextMenu(e, col.key)}
                                    className={`table-th ${stickyHeader ? 'th-sticky' : ''} ${frozenClass(index)} ${draggedIdx === index ? 'dragging-active' : ''} ${getDropIndicatorClass(index)}`}
                                    style={frozenStyle(index)}
                                >
                                    <div className="th-content-wrapper">
                                        <button
                                            type="button"
                                            className={`th-sort-btn ${sortConfig?.key === col.key ? 'sort-active' : ''}`}
                                            onClick={(e) => handleSortClick(e, col.key)}
                                            title="Sort by this column"
                                        >
                                            <span className="th-text">{col.label}</span>
                                            <span className="sort-indicator">
                                                {sortConfig?.key === col.key ? (sortConfig!.direction === 'asc' ? '▲' : '▼') : '⇅'}
                                            </span>
                                        </button>
                                        <div className="grid-drag-handle" draggable onMouseDown={() => setIsHandleDragging(true)} onMouseUp={() => setIsHandleDragging(false)}>⋮⋮</div>
                                    </div>
                                    <div
                                        className="col-resize-handle"
                                        onPointerDown={(e) => handleResizeStart(e, col.key)}
                                        onDoubleClick={(e) => handleResizeDoubleClick(e, col.key, col.label)}
                                    />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {renderedRows.map((row, rowIndex) => {
                            const isRowParent = isParent(row.id);

                            return (
                                <tr key={rowKeys.get(row) ?? row.id} data-row-id={row.id} className="table-tr">
                                    {columns.map((col, colIndex) => {
                                        const span = mergeSpans.get(col.key)?.[rowIndex] ?? 1;
                                        if (span === 0) return null; // covered by the merged cell above
                                        return (
                                            <TableCell
                                                key={col.key}
                                                row={row}
                                                col={col}
                                                rowIndex={rowIndex}
                                                colIndex={colIndex}
                                                span={span}
                                                isRowParent={isRowParent}
                                                filtering={!!filterSets}
                                                className={`${frozenClass(colIndex)} ${getDropIndicatorClass(colIndex)}`}
                                                style={frozenStyle(colIndex)}
                                                onToggleExpand={toggleExpand}
                                                onCellChange={handleCellChange}
                                                onNumberCommit={handleNumberBlur}
                                                onCellKeyDown={handleCellKeyDown}
                                                onShowProblem={showProblemTip}
                                                onHideProblem={hideProblemTip}
                                            />
                                        );
                                    })}
                                </tr>
                            );
                        })}
                        {visibleData.length === 0 && (
                            <tr>
                                <td colSpan={columns.length} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                                    {filterSets ? 'No items match' : 'No items in table'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <ProblemTip tip={problemTip} />

            {/* Synced Bottom Horizontal Scrollbar */}
            <div
                ref={bottomScrollRef}
                className="overflow-x-auto sticky bottom-0 z-20 bg-zinc-900/40 backdrop-blur-sm border-t border-zinc-800/60"
                style={{ height: '14px', marginTop: '2px' }}
            >
                <div style={{ width: `${tableWidth}px`, height: '1px' }} />
            </div>

            {contextMenu.visible && (
                <div ref={contextMenuRef} className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { if (contextMenu.columnIndex > 0) moveColumn(contextMenu.columnIndex, contextMenu.columnIndex - 1); closeContextMenu(); }} disabled={contextMenu.columnIndex === 0}>Move Left</button>
                    <button onClick={() => { if (contextMenu.columnIndex < columns.length - 1) moveColumn(contextMenu.columnIndex, contextMenu.columnIndex + 1); closeContextMenu(); }} disabled={contextMenu.columnIndex === columns.length - 1}>Move Right</button>
                </div>
            )}
        </div>
    );
}

export default Table;