import { ImageResponse } from "next/og";
import { BRAND_HEX } from "@/lib/brand";
import { MarkTile } from "@/lib/brand-image";
import en from "@/messages/en.json";

// Social preview (WhatsApp, X, Facebook link cards). Static, English; calm, no imagery.
// ponytail: uses the next/og default font; bundle Geist (the `geist` package) if the owner approves a dependency.
export const alt = en.meta.description;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: BRAND_HEX.surface,
          color: BRAND_HEX.ink,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <MarkTile size={152} radius={34} />
          <div style={{ fontSize: 112, fontWeight: 700, letterSpacing: "-0.03em" }}>{en.meta.title}</div>
        </div>
        <div style={{ marginTop: 48, fontSize: 44, lineHeight: 1.3, color: BRAND_HEX.inkMuted, maxWidth: 960 }}>
          {en.meta.description}
        </div>
      </div>
    ),
    size,
  );
}
