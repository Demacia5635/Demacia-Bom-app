import { quotedList, type SameNumberGroup } from "./sameParts";

/**
 * Above the BOM table: catalog numbers used by several items (sameParts.ts).
 * Same name = the same part: "Combine" makes it one row. Different names = a
 * mistake to fix in Onshape (also a problem on the rows); "Combine anyway"
 * if they really are one part. Nothing is combined without a click here or
 * in the Publish dialog.
 */
export default function SameNumberNotice({
  groups,
  onCombine,
}: {
  groups: SameNumberGroup[];
  onCombine: (keys: string[]) => void;
}) {
  if (groups.length === 0) return null;
  const copies = groups.filter((g) => g.kind === "copies");
  return (
    <div className="same-number-notice mb-2" role="status">
      <div className="same-number-notice-title">
        {groups.length === 1 ? "A catalog number is" : `${groups.length} catalog numbers are`} used by more than one item
      </div>
      <ul>
        {groups.map((g) => {
          const names = [...new Set(g.items.map((i) => String(i.name ?? "").trim()))];
          return (
            <li key={g.key} className={g.kind === "conflict" ? "same-number-conflict" : undefined}>
              <span>
                <strong>{g.catalogNumber}</strong>
                {g.kind === "copies" ? (
                  <> · {g.items.length} parts named {quotedList(names)}: the same part, listed {g.items.length} times.</>
                ) : g.combinable ? (
                  <> · used by {quotedList(names)}: different names. Give each its own catalog number in Onshape.</>
                ) : (
                  <> · used by {quotedList(names)}, including an assembly. Give each its own catalog number in Onshape.</>
                )}
              </span>
              {g.combinable && (
                <button
                  type="button"
                  className="bom-toolbar-btn"
                  title={g.kind === "copies"
                    ? "List them as one part with the total quantity. Saved on Publish BOM."
                    : "They are the same part after all: list them as one (one name). Saved on Publish BOM."}
                  onClick={() => onCombine([g.key])}
                >
                  {g.kind === "copies" ? "Combine" : "Combine anyway"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {copies.length > 1 && (
        <button type="button" className="bom-toolbar-btn" onClick={() => onCombine(copies.map((g) => g.key))}>
          Combine all {copies.length} same-name parts
        </button>
      )}
    </div>
  );
}
