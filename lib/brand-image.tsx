// JSX for next/og ImageResponse: the mark on a tile. Server-side image generation only.
import { BRAND_HEX, MARK_CELLS, MARK_VIEWBOX } from "./brand";

export function MarkSvg({ size, body, dimple }: { size: number; body: string; dimple: string }) {
  return (
    <svg width={size} height={size} viewBox={MARK_VIEWBOX}>
      {MARK_CELLS.map((c) => (
        <g key={`${c.cx},${c.cy}`} transform={`rotate(${c.rotate} ${c.cx} ${c.cy})`}>
          <ellipse cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry} fill={body} />
          <ellipse cx={c.dimple.cx} cy={c.dimple.cy} rx={c.dimple.rx} ry={c.dimple.ry} fill={dimple} />
        </g>
      ))}
    </svg>
  );
}

/**
 * Red tile with the white cells (home screen, favicon, social previews: outside the UI).
 * `radius` 0 for full-bleed icons that the OS masks (maskable, Apple). The mark sits well inside
 * the maskable safe zone (centre 80% circle).
 */
export function MarkTile({ size, radius = 0, markScale = 0.72 }: { size: number; radius?: number; markScale?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_HEX.brand,
        borderRadius: radius,
      }}
    >
      <MarkSvg size={Math.round(size * markScale)} body={BRAND_HEX.onBrand} dimple={BRAND_HEX.onBrandDimple} />
    </div>
  );
}
