import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GLÖGGT",
    short_name: "GLÖGGT",
    description: "GLÖGGT Mobile",
    start_url: "/mobile",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "is",
  };
}