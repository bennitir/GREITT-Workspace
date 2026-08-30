import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GLÖGGT",
    short_name: "GLÖGGT",
    description: "GLÖGGT Mobile",
    start_url: "/mobile",
    scope: "/mobile",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "is",
    icons: [
      {
        src: "/gloggt-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/gloggt-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}