import type { MetadataRoute } from "next";
import { BRAND_HEX } from "@/lib/brand";
import en from "@/messages/en.json";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: en.meta.title,
    short_name: en.meta.title,
    description: en.meta.description,
    start_url: "/",
    display: "standalone",
    background_color: BRAND_HEX.surface,
    theme_color: BRAND_HEX.surface,
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
