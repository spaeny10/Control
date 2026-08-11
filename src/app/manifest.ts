import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BIGVIEW Control",
    short_name: "BIGVIEW",
    description:
      "CRM, quoting, rental and subscription management for BIGVIEW security trailers.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f4f5f7",
    theme_color: "#2b3245",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Jump straight to the screens field crews and managers use most.
    shortcuts: [
      { name: "Dispatch", url: "/dispatch" },
      { name: "Fleet", url: "/fleet" },
      { name: "Pipeline", url: "/leads" },
    ],
  };
}
