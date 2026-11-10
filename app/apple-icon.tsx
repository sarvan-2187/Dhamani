import { ImageResponse } from "next/og";
import { MarkTile } from "@/lib/brand-image";

// iOS rounds the corners itself, so this is full-bleed.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<MarkTile size={180} markScale={0.64} />, size);
}
