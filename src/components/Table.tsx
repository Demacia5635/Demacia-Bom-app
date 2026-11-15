import { useEffect, useMemo, useRef, useState } from "react";
import { AuthenticatedImage } from "../util/ApiService";

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

interface RowContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    rowId: string | null;
}

interface DraftInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'> {
    value: string | number | undefined | null;
    /** Called once with the final text when the edit ends (blur, Enter, Tab, arrow out), only if it changed. */
    onCommit: (text: string) => void;
}

/**
 * Text cell that keeps its own draft while focused and hands the value to the
 * table only when the edit ends. Committing on every keystroke re-sorted and
 * re-rendered the whole table per key, which moved rows mid-edit, dropped
 * focus (and the select-on-focus then replaced the text) and made typing lag.
 * Escape cancels the edit.
 */
function DraftInput({ value, onCommit, onKeyDown, onFocus, ...rest }: DraftInputProps) {
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
                if (draft !== external) onCommit(draft);
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
    apiPath?: string | ((value: any) => string);
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
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
    const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
    const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);
    const [isHandleDragging, setIsHandleDragging] = useState<boolean>(false);

    const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, columnIndex: -1 });
    const [, setRowContextMenu] = useState<RowContextMenuState>({ visible: false, x: 0, y: 0, rowId: null });

    // Tooltip of a problem cell, drawn by the table: the browser's own title
    // tooltip is slow, and doesn't show over the cell's input in the extension panel.
    const [problemTip, setProblemTip] = useState<{ text: string; left: number; top: number } | null>(null);
    const showProblemTip = (cell: HTMLElement, text: string) => {
        const r = cell.getBoundingClientRect();
        const left = Math.max(8, Math.min(r.left, window.innerWidth - 288));
        setProblemTip({ text, left, top: r.bottom + 4 });
    };
    useEffect(() => {
        if (!problemTip) return;
        // The tooltip doesn't follow its cell, so scrolling hides it.
        const hide = () => setProblemTip(null);
        window.addEventListener('scroll', hide, true);
        return () => window.removeEventListener('scroll', hide, true);
    }, [problemTip]);

    const wrapperRef = useRef<HTMLDivElement>(null);
    const bottomScrollRef = useRef<HTMLDivElement>(null);
    const [tableWidth, setTableWidth] = useState<number>(0);
    const [autoLastColWidth, setAutoLastColWidth] = useState<number | null>(null);

    // Only the user's column order is state; the columns themselves always come
    // from the current columnsData prop, so later changes to it (labels,
    // callbacks, added/removed columns) take effect. Pass a stable array
    // (module constant or useMemo): effects below depend on `columns`.
    const [columnOrder, setColumnOrder] = useState<string[]>(() => columnsData.map(c => c.key));
    const columns = useMemo(() => {
        const byKey = new Map(columnsData.map(c => [c.key, c] as const));
        const ordered = columnOrder.filter(k => byKey.has(k)).map(k => byKey.get(k)!);
        for (const c of columnsData) if (!columnOrder.includes(c.key)) ordered.push(c);
        return ordered;
    }, [columnsData, columnOrder]);
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(initialSort ?? null);

    // Sticky header: the table must scroll inside its own box for the header to
    // stay pinned, so the box is sized to reach the bottom of the window.
    const [fitHeight, setFitHeight] = useState<number | null>(null);
    useEffect(() => {
        if (!stickyHeader) return;
        const fit = () => {
            const wrapper = wrapperRef.current;
            if (!wrapper) return;
            const top = wrapper.getBoundingClientRect().top + window.scrollY;
            // Leave room for the synced horizontal scrollbar under the table.
            setFitHeight(Math.max(200, window.innerHeight - top - 24));
        };
        fit();
        window.addEventListener('resize', fit);
        const ro = new ResizeObserver(fit);
        if (wrapperRef.current?.parentElement) ro.observe(wrapperRef.current.parentElement);
        return () => {
            window.removeEventListener('resize', fit);
            ro.disconnect();
        };
    }, [stickyHeader]);

    const closeContextMenu = () => { setContextMenu(prev => ({ ...prev, visible: false })); setRowContextMenu(prev => ({ ...prev, visible: false })); };

    const handleRowContextMenu = (e: React.MouseEvent, rowId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setRowContextMenu({ visible: true, x: e.clientX, y: e.clientY, rowId });
    };

    // Synchronize horizontal scrolling between the main table wrapper and the bottom scrollbar
    useEffect(() => {
        const wrapper = wrapperRef.current;
        const bottomScroll = bottomScrollRef.current;
        if (!wrapper || !bottomScroll) return;

        const handleWrapperScroll = () => {
            if (bottomScroll.scrollLeft !== wrapper.scrollLeft) {
                bottomScroll.scrollLeft = wrapper.scrollLeft;
            }
        };

        const handleBottomScroll = () => {
            if (wrapper.scrollLeft !== bottomScroll.scrollLeft) {
                wrapper.scrollLeft = bottomScroll.scrollLeft;
            }
        };

        wrapper.addEventListener('scroll', handleWrapperScroll);
        bottomScroll.addEventListener('scroll', handleBottomScroll);

        return () => {
            wrapper.removeEventListener('scroll', handleWrapperScroll);
            bottomScroll.removeEventListener('scroll', handleBottomScroll);
        };
    }, []);

    // Track table content width for the synced bottom scrollbar spacer
    useEffect(() => {
        const table = wrapperRef.current?.querySelector('table');
        if (!table) return;

        const updateWidth = () => {
            setTableWidth(table.scrollWidth);
        };

        updateWidth();
        const observer = new ResizeObserver(updateWidth);
        observer.observe(table);
        return () => observer.disconnect();
    }, [columns, data, columnWidths]);

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

    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        const lastCol = columns[columns.length - 1];
        if (!lastCol) {
            setAutoLastColWidth(null);
            return;
        }

        const recompute = () => {
            if (Object.prototype.hasOwnProperty.call(columnWidths, lastCol.key)) {
                setAutoLastColWidth(null);
                return;
            }

            const othersWidth = columns
                .slice(0, -1)
                .reduce((sum, c) => sum + (columnWidths[c.key] || defaultColWidth), 0);

            const available = wrapper.clientWidth - othersWidth;
            setAutoLastColWidth(Math.max(minLastColWidth, available));
        };

        recompute();

        const ro = new ResizeObserver(recompute);
        ro.observe(wrapper);
        return () => ro.disconnect();
    }, [columns, columnWidths]);

    const handleResizeStart = (e: React.PointerEvent, key: string) => {
        e.stopPropagation();
        e.preventDefault();

        const th = (e.target as HTMLElement).closest('th');
        if (!th) return;

        const table = th.closest('table');
        const colIndex = Array.from(th.parentNode?.children || []).indexOf(th);
        const colElement = table?.querySelector('colgroup')?.children[colIndex] as HTMLElement;

        const initialWidth = colElement ? colElement.getBoundingClientRect().width : th.getBoundingClientRect().width;
        const startX = e.clientX;
        const wrapper = th.closest('.table-wrapper') as HTMLElement;

        let currentWidth = initialWidth;
        let latestClientX = startX;
        let isActive = true;
        let rafId: number | null = null;

        const EDGE_ZONE = 40;
        const MAX_EDGE_SPEED = 40;

        const targetElement = e.target as HTMLElement;
        targetElement.setPointerCapture(e.pointerId);

        const applyWidth = (w: number) => {
            currentWidth = Math.max(60, w);
            if (colElement) colElement.style.width = `${currentWidth}px`;
            if (table) table.style.width = 'max-content';
        };

        const tick = () => {
            if (!isActive) return;

            const rawDelta = latestClientX - startX;
            const absDelta = Math.abs(rawDelta);
            const isShrinking = rawDelta < 0;

            const speedMultiplier = 1 + (absDelta * 0.015);
            const scaledDelta = rawDelta * speedMultiplier;

            applyWidth(initialWidth + scaledDelta);

            const distanceIntoRightEdge = latestClientX - (window.innerWidth - EDGE_ZONE);
            if (distanceIntoRightEdge > 0) {
                const growth = Math.min(MAX_EDGE_SPEED, (distanceIntoRightEdge / EDGE_ZONE) * MAX_EDGE_SPEED);
                applyWidth(currentWidth + growth);
                if (wrapper) wrapper.scrollLeft += growth * 1.5;
            } else if (latestClientX <= EDGE_ZONE) {
                const distanceIntoLeftEdge = EDGE_ZONE - latestClientX;
                const shrink = Math.min(MAX_EDGE_SPEED, (distanceIntoLeftEdge / EDGE_ZONE) * MAX_EDGE_SPEED);
                applyWidth(currentWidth - shrink);
            }

            if (wrapper && !isShrinking) {
                const wrapperRect = wrapper.getBoundingClientRect();
                if (latestClientX > wrapperRect.right - 100) {
                    const scrollPush = Math.max(5, (latestClientX - (wrapperRect.right - 100)) * 0.8);
                    wrapper.scrollLeft += scrollPush;
                }
            }

            rafId = requestAnimationFrame(tick);
        };

        const onPointerMove = (moveEvent: PointerEvent) => {
            latestClientX = moveEvent.clientX;
        };

        const onPointerUp = (upEvent: PointerEvent) => {
            isActive = false;
            if (rafId !== null) cancelAnimationFrame(rafId);
            targetElement.releasePointerCapture(upEvent.pointerId);
            targetElement.removeEventListener('pointermove', onPointerMove);
            targetElement.removeEventListener('pointerup', onPointerUp);

            setColumnWidths(prev => ({ ...prev, [key]: currentWidth }));
        };

        targetElement.addEventListener('pointermove', onPointerMove);
        targetElement.addEventListener('pointerup', onPointerUp);
        rafId = requestAnimationFrame(tick);
    };

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

    /** `open`: its children are shown (expanded, or opened by the row filter). */
    type RenderRow = typeof data[0] & { level: number; open: boolean };

    const sortSiblings = (rows: (RowData & any)[]): (RowData & any)[] => {
        if (!sortConfig) return rows;
        const { key, direction } = sortConfig;
        const dir = direction === 'asc' ? 1 : -1;

        return [...rows].sort((a, b) => {
            const aVal = a[key];
            const bVal = b[key];

            if (aVal === bVal) return 0;
            if (aVal === null || aVal === undefined) return 1 * dir === 0 ? 0 : 1;
            if (bVal === null || bVal === undefined) return -1;

            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return (aVal - bVal) * dir;
            }

            const aNum = Number(aVal);
            const bNum = Number(bVal);
            if (!isNaN(aNum) && !isNaN(bNum) && aVal !== '' && bVal !== '') {
                return (aNum - bNum) * dir;
            }

            return String(aVal).localeCompare(String(bVal)) * dir;
        });
    };

    // Children of each row, built once per data change. Looking them up by
    // scanning every row for every row made large tables slow (n x n work).
    const childrenByParent = useMemo(() => {
        const map = new Map<string | null, (RowData & any)[]>();
        for (const row of data) {
            const list = map.get(row.parentId);
            if (list) list.push(row);
            else map.set(row.parentId, [row]);
        }
        return map;
    }, [data]);

    const isParent = (id: string) => childrenByParent.has(id);

    // With a row filter: the matching rows, and every row above one (kept open).
    // An id can sit under several parents (the BOM extension lists a shared
    // sub-assembly under each parent that uses it), so follow every parent.
    const filterSets = useMemo(() => {
        if (!rowFilter) return null;
        const parentsOf = new Map<string, (string | null)[]>();
        for (const row of data) {
            const list = parentsOf.get(row.id);
            if (list) list.push(row.parentId);
            else parentsOf.set(row.id, [row.parentId]);
        }
        const matches = new Set<string>();
        const ancestors = new Set<string>();
        const addAncestors = (id: string) => {
            for (const p of parentsOf.get(id) ?? []) {
                if (p === null || ancestors.has(p)) continue;
                ancestors.add(p);
                addAncestors(p);
            }
        };
        for (const row of data) {
            if (!rowFilter(row)) continue;
            matches.add(row.id);
            addAncestors(row.id);
        }
        return { matches, ancestors };
    }, [data, rowFilter]);

    const visibleData = useMemo((): RenderRow[] => {
        const result: RenderRow[] = [];
        const addChildren = (parentId: string | null, level: number) => {
            const children = sortSiblings(childrenByParent.get(parentId) ?? []);
            for (const child of children) {
                if (hideRow?.(child)) continue;
                if (filterSets && !filterSets.matches.has(child.id) && !filterSets.ancestors.has(child.id)) continue;
                const open = childrenByParent.has(child.id) && (filterSets ? filterSets.ancestors.has(child.id) : child.isExpanded);
                result.push({ ...child, level, open });
                if (open) addChildren(child.id, level + 1);
            }
        };
        addChildren(null, 0);
        return result;
        // sortSiblings only depends on sortConfig.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [childrenByParent, sortConfig, filterSets, hideRow]);

    /**
     * React key of each shown row. Row ids aren't always unique: in the BOM
     * extension a part used in several sub-assemblies (or listed twice by
     * Onshape) has the same id each time. Duplicate React keys make React
     * leave stale rows on screen and multiply rows on every re-render (hidden
     * standard parts stayed visible; 2 sensors became 5). So the key is the
     * parent + id, plus a counter for repeats under the same parent. The row
     * id itself (data-row-id, edits) is unchanged.
     */
    const rowKeys = useMemo(() => {
        const keys = new Map<RenderRow, string>();
        const seen = new Map<string, number>();
        for (const row of visibleData) {
            const base = `${row.parentId ?? ''}>${row.id}`;
            const n = seen.get(base) ?? 0;
            seen.set(base, n + 1);
            keys.set(row, n === 0 ? base : `${base}#${n}`);
        }
        return keys;
    }, [visibleData]);

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

    const handleDragStart = (e: React.DragEvent, index: number) => {
        if (!isHandleDragging) { e.preventDefault(); return; }
        setDraggedIdx(index);
        const img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        e.dataTransfer.setDragImage(img, 0, 0);
        closeContextMenu();
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIdx === null) return;
        setDropTargetIdx(index);
    };

    const handleDrop = (targetIdx: number) => {
        if (draggedIdx === null || draggedIdx === targetIdx) { resetDragState(); return; }
        const originalFromIdx = columns.findIndex(c => c.key === columns[draggedIdx].key);
        const originalToIdx = columns.findIndex(c => c.key === columns[targetIdx].key);
        moveColumn(originalFromIdx, originalToIdx);
        resetDragState();
    };

    const resetDragState = () => { setDraggedIdx(null); setDropTargetIdx(null); setIsHandleDragging(false); };

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
    const getDropIndicatorClass = (index: number) => (draggedIdx !== null && dropTargetIdx !== null && index === dropTargetIdx && draggedIdx !== dropTargetIdx) ? 'drop-indicator-both' : '';

    const handleCellChange = (rowId: string, col: ColumnConfig, rawValue: any) => {
        setData(
            data.map(row => {
                if (row.id !== rowId) return row;
                const updatedRow = { ...row };
                (updatedRow as any)[col.key] = rawValue;
                return updatedRow;
            }));
    };

    const handleNumberBlur = (rowId: string, col: ColumnConfig, rawValue: string | number) => {
        const strVal = String(rawValue).trim();
        if (strVal === '' || strVal === '.') {
            handleCellChange(rowId, col, '0');
            return;
        }

        let processed = strVal;
        if (col.key === 'quantity' || col.key === 'revision') {
            const intVal = parseInt(processed, 10);
            const finalVal = isNaN(intVal) ? 0 : Math.max(0, intVal);
            handleCellChange(rowId, col, String(finalVal));
            return;
        }

        if (processed.startsWith('.')) processed = '0' + processed;
        if (processed.endsWith('.')) processed = processed.slice(0, -1);

        const num = Number(processed);
        const finalVal = isNaN(num) ? 0 : num;
        handleCellChange(rowId, col, String(finalVal));
    };

    const moveColumn = (fromIdx: number, toIdx: number) => {
        if (toIdx < 0 || toIdx >= columns.length) return;
        const updatedColumns = [...columns];
        const [movedItem] = updatedColumns.splice(fromIdx, 1);
        updatedColumns.splice(toIdx, 0, movedItem);
        setColumnOrder(updatedColumns.map(c => c.key));
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
                        {visibleData.filter((_row, i) => !removeTopRow || (i !== 0)).map((row, rowIndex) => {
                            const isRowParent = isParent(row.id);

                            return (
                                <tr key={rowKeys.get(row) ?? row.id} data-row-id={row.id} className="table-tr" onContextMenu={(e) => handleRowContextMenu(e, row.id)}>
                                    {columns.map((col, colIndex) => {
                                        let isCellDisabled = col.isDisabled ? col.isDisabled(row) : false;
                                        let displayValue: string | number = row[col.key] as string | number;
                                        const cellProblem = col.problem?.(row);

                                        return (
                                            <td
                                                key={col.key}
                                                style={frozenStyle(colIndex)}
                                                onMouseEnter={cellProblem ? (e) => showProblemTip(e.currentTarget, cellProblem) : undefined}
                                                onMouseLeave={cellProblem ? () => setProblemTip(null) : undefined}
                                                onFocus={cellProblem ? (e) => showProblemTip(e.currentTarget, cellProblem) : undefined}
                                                onBlur={cellProblem ? () => setProblemTip(null) : undefined}
                                                className={`table-td ${frozenClass(colIndex)} ${getDropIndicatorClass(colIndex)} ${isCellDisabled ? 'cell-disabled' : ''} ${col.isModified?.(row) ? 'cell-modified' : ''} ${cellProblem ? 'cell-problem' : ''}`}>
                                                <div className="td-content-wrapper" style={colIndex === 0 ? { paddingLeft: `${row.level * 24}px` } : {}}>
                                                    {colIndex === 0 && isRowParent && (
                                                        <button
                                                            className="expand-toggle"
                                                            onClick={(e) => toggleExpand(row.id, e)}
                                                            disabled={!!filterSets}
                                                            title={filterSets ? 'Clear the search to expand or collapse' : undefined}
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
                                                            onChange={(e) => handleCellChange(row.id, col, e.target.value)}
                                                            onKeyDown={(e) => handleCellKeyDown(e, rowIndex, colIndex)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className={`cell-input cell-select ${col.valueClass?.(displayValue) ?? ''}`}
                                                            disabled={isCellDisabled}
                                                        >
                                                            <option value="" disabled>Select...</option>
                                                            {col.options?.map((option) => (
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
                                                                    src={row[col.key]}
                                                                    alt={col.label || "Image"}
                                                                    className="w-full h-full object-cover" />
                                                            </div>
                                                        ))()

                                                    ) : col.type === 'boolean' ? (
                                                        <input
                                                            type="checkbox"
                                                            checked={!!row[col.key]}
                                                            onChange={(e) => handleCellChange(row.id, col, e.target.checked)}
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
                                                            onCommit={(text) => handleNumberBlur(row.id, col, text)}
                                                            onFocus={(e) => e.target.select()}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.currentTarget.blur();
                                                                } else {
                                                                    handleCellKeyDown(e, rowIndex, colIndex);
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
                                                            onCommit={(text) => handleCellChange(row.id, col, text)}
                                                            placeholder={col.placeholder?.(row)}
                                                            onFocus={(e) => e.target.select()}
                                                            onKeyDown={(e) => handleCellKeyDown(e, rowIndex, colIndex)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="cell-input"
                                                            disabled={isCellDisabled}
                                                        />
                                                    )}
                                                </div>
                                            </td>
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

            {problemTip && (
                <div className="cell-problem-tip" role="tooltip" style={{ left: problemTip.left, top: problemTip.top }}>
                    {problemTip.text}
                </div>
            )}

            {/* Synced Bottom Horizontal Scrollbar */}
            <div
                ref={bottomScrollRef}
                className="overflow-x-auto sticky bottom-0 z-20 bg-zinc-900/40 backdrop-blur-sm border-t border-zinc-800/60"
                style={{ height: '14px', marginTop: '2px' }}
            >
                <div style={{ width: `${tableWidth}px`, height: '1px' }} />
            </div>

            {contextMenu.visible && (
                <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { if (contextMenu.columnIndex > 0) moveColumn(contextMenu.columnIndex, contextMenu.columnIndex - 1); closeContextMenu(); }} disabled={contextMenu.columnIndex === 0}>Move Left</button>
                    <button onClick={() => { if (contextMenu.columnIndex < columns.length - 1) moveColumn(contextMenu.columnIndex, contextMenu.columnIndex + 1); closeContextMenu(); }} disabled={contextMenu.columnIndex === columns.length - 1}>Move Right</button>
                </div>
            )}
        </div>
    );
}

export default Table;