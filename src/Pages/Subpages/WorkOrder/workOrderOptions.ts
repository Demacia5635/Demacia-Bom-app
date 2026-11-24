/** The choices in the work order's Manufacturing method and Priority columns (and filters). */
export const MANUFACTURING_METHODS = ['Manual', 'Milled', 'Lathed', 'CNC', 'Printed', 'Externally produced', 'Purchased'];
export const PRIORITIES = ['High', 'Medium', 'Low', 'Untracked', 'Finished'];

/** Status choices for a part the team makes. */
export const MADE_STATUSES = ['CATNUM Written', 'In Planning', 'Manufacturing approved', 'In manufacturing', 'Finished Manufacturing', 'Untracked'];
/** Status choices for a bought item (isPurchasedRow); a new work order starts them at "Untracked". */
export const BOUGHT_STATUSES = ['Untracked', 'To buy', 'Finished'];

/**
 * A bought item's status as shown: stored values from before bought items
 * had their own list are mapped, not rewritten ("Untracked" stays; finished,
 * by status or priority, is "Finished"; any other status is "To buy").
 */
export function boughtStatus(statusCode: string, priority?: string): string {
  if (statusCode === 'Finished' || statusCode === 'Finished Manufacturing' || priority === 'Finished') return 'Finished';
  if (statusCode === 'Untracked') return 'Untracked';
  return 'To buy';
}

/** A bought item's status for a row that's made again (its method changed): the nearest made status. */
export function madeStatus(statusCode: string): string {
  if (statusCode === 'Finished') return 'Finished Manufacturing';
  if (statusCode === 'To buy') return 'In Planning';
  return statusCode;
}

/**
 * Colour of each status / method / priority value (classes styled in
 * css/table.css). Values not listed stay uncoloured.
 */
const VALUE_COLOURS: Record<string, string> = {
    'In Planning': 'status-bg-orange',
    'To buy': 'status-bg-orange',
    'In manufacturing': 'status-bg-orange',
    'Medium': 'status-bg-orange',
    'Manual': 'status-bg-orange',

    'Manufacturing approved': 'status-bg-blue',
    'Untracked': 'status-bg-blue',
    'Milled': 'status-bg-blue',
    'Lathed': 'status-bg-blue',
    'CNC': 'status-bg-blue',
    'Printed': 'status-bg-blue',
    'Externally produced': 'status-bg-blue',
    'Purchased': 'status-bg-blue',

    'Finished Manufacturing': 'status-bg-green',
    'Finished': 'status-bg-green',
    'Low': 'status-bg-green',

    'CATNUM Written': 'status-bg-red',
    'High': 'status-bg-red',
};
export const valueColour = (value: unknown) => VALUE_COLOURS[String(value ?? '')];
