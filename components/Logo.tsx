import { useTranslations } from "next-intl";
import { MARK_CELLS, MARK_VIEWBOX } from "@/lib/brand";

/** The three-cell mark in brand red (DESIGN_SYSTEM 7). Decorative: the wordmark or a label names it. */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox={MARK_VIEWBOX} aria-hidden focusable="false">
      {MARK_CELLS.map((c) => (
        <g key={`${c.cx},${c.cy}`} transform={`rotate(${c.rotate} ${c.cx} ${c.cy})`}>
          <ellipse cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry} className="fill-brand" />
          <ellipse cx={c.dimple.cx} cy={c.dimple.cy} rx={c.dimple.rx} ry={c.dimple.ry} className="fill-brand-deep" />
        </g>
      ))}
    </svg>
  );
}

/** Mark + wordmark lockup: Geist 600, wordmark in ink (never red). */
export function Logo({ size = 28 }: { size?: number }) {
  const t = useTranslations("header");
  return (
    <span className="inline-flex items-center gap-2 text-xl font-semibold text-ink">
      <LogoMark size={size} />
      {t("wordmark")}
    </span>
  );
}
