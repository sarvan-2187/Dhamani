import { ImageResponse } from "next/og";
import { MarkTile } from "@/lib/brand-image";

// "any" icons get rounded corners; "maskable" is full-bleed so the OS can apply its own mask.
// 1024 is for store or dashboard listings (for example the Meta app icon).
const ICONS: Record<string, { size: number; maskable: boolean }> = {
  "192": { size: 192, maskable: false },
  "512": { size: 512, maskable: false },
  "1024": { size: 1024, maskable: false },
  "maskable-512": { size: 512, maskable: true },
};

export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(ICONS).map((size) => ({ size }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const icon = ICONS[(await params).size];
  if (!icon) return new Response("Not found", { status: 404 });
  const { size, maskable } = icon;
  return new ImageResponse(
    <MarkTile size={size} radius={maskable ? 0 : Math.round(size * 0.22)} markScale={maskable ? 0.56 : 0.72} />,
    { width: size, height: size },
  );
}
