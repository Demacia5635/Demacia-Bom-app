import { useThemeSync } from "./useThemeSync";

/**
 * The website's shared Tailwind class sets for the current theme (light /
 * dark), so pages don't each repeat `isLight ? "..." : "..."` for the same
 * look. One-off classes stay in their component.
 */
export interface ThemeClasses {
  /** Page background and text. */
  page: string;
  /** Headings. */
  textHeading: string;
  /** Values next to a label. */
  textValue: string;
  /** Labels (filters, form fields). */
  textLabel: string;
  /** Secondary text, "Loading..." messages. */
  textMuted: string;
  /** Hover colour of a muted control that turns heading-coloured. */
  hoverHeading: string;
  /** Dividers and row borders. */
  border: string;
  /** A plain card (with `border`). */
  card: string;
  /** A card with its text colour (tables, header cards). */
  cardWithText: string;
  /** A raised card (search box, list) with its text colour and shadow. */
  raisedCard: string;
  /** A table's header row. */
  tableHeader: string;
  /** Hover of a list row. */
  rowHover: string;
  /** The box behind an image. */
  imageBox: string;
  /** A text input. */
  input: string;
}

const LIGHT: ThemeClasses = {
  page: "bg-zinc-50 text-zinc-900",
  textHeading: "text-zinc-900",
  textValue: "text-zinc-800",
  textLabel: "text-zinc-600",
  textMuted: "text-zinc-500",
  hoverHeading: "hover:text-zinc-900",
  border: "border-zinc-200",
  card: "bg-white border-zinc-200",
  cardWithText: "bg-white border-zinc-200 text-zinc-900",
  raisedCard: "bg-white border-zinc-300 text-zinc-900 shadow-xl",
  tableHeader: "bg-zinc-100 text-zinc-700",
  rowHover: "hover:bg-zinc-50",
  imageBox: "bg-zinc-100 border-zinc-200",
  input: "bg-white border-zinc-300 text-zinc-900 placeholder-zinc-500",
};

const DARK: ThemeClasses = {
  page: "bg-zinc-950 text-zinc-100",
  textHeading: "text-white",
  textValue: "text-zinc-200",
  textLabel: "text-zinc-400",
  textMuted: "text-zinc-400",
  hoverHeading: "hover:text-white",
  border: "border-zinc-800",
  card: "bg-zinc-900 border-zinc-800",
  cardWithText: "bg-zinc-900 border-zinc-800 text-zinc-100",
  raisedCard: "bg-zinc-900 border-zinc-800 text-zinc-100 shadow-2xl",
  tableHeader: "bg-zinc-950 text-zinc-300",
  rowHover: "hover:bg-zinc-800/50",
  imageBox: "bg-zinc-950 border-zinc-800",
  input: "bg-zinc-900 border-zinc-800 text-zinc-100 placeholder-zinc-500",
};

export function useThemeClasses(): ThemeClasses {
  const { isLight } = useThemeSync();
  return isLight ? LIGHT : DARK;
}
