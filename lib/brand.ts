// The Dhamani mark: three red blood cells (owner's pick, concept C, 2026-11-10), from the owner's
// reference_for_logo.png. Each cell is a disc with a darker dimple, tilted a little. One source for
// the in-app <LogoMark> and every generated image (icons, apple icon, OG).
// DESIGN_SYSTEM 7: cells, never drops, hearts or needles. The mark is red; the wordmark stays ink.

export const MARK_VIEWBOX = "0 0 32 32";

type Ellipse = { cx: number; cy: number; rx: number; ry: number };
export const MARK_CELLS: readonly (Ellipse & { rotate: number; dimple: Ellipse })[] = [
  { cx: 10, cy: 20, rx: 8.6, ry: 7.6, rotate: -18, dimple: { cx: 9.6, cy: 19.4, rx: 4, ry: 3.2 } },
  { cx: 20, cy: 8.6, rx: 7, ry: 6.4, rotate: 10, dimple: { cx: 19.6, cy: 8.2, rx: 3.2, ry: 2.6 } },
  { cx: 24, cy: 22.6, rx: 7.4, ry: 5.8, rotate: -8, dimple: { cx: 23.6, cy: 21.9, rx: 3.6, ry: 2.2 } },
];

// Image renderers (next/og, the web manifest) cannot read CSS variables, so these mirror the light
// and dark tokens in app/globals.css. Change both together.
export const BRAND_HEX = {
  brand: "#c81e2b",
  brandDeep: "#a8151f",
  onBrand: "#ffffff",
  onBrandDimple: "#f4b9be", // the dimple when the cells are white on a red tile
  ink: "#1a1314",
  inkMuted: "#6b5f60",
  border: "#ece5e5",
  surface: "#ffffff",
  surfaceDark: "#000000",
} as const;
