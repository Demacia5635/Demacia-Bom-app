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
