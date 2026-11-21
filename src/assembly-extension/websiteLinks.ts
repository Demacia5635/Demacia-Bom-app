/**
 * Links from the extension to the team's website (GitHub Pages, a hash
 * router: pages are under "#/").
 */
export const WEBSITE_URL = "https://demacia5635.github.io/Demacia-Bom-app/";

/** The website's page for a saved assembly, by its database record ID. */
export function bomPageUrl(bomRecordId: string): string {
  return `${WEBSITE_URL}#/bom/${encodeURIComponent(bomRecordId)}`;
}
