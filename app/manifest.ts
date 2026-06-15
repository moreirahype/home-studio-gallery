import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Home Studio - Ensaios com IA",
    short_name: "Home Studio",
    description:
      "Crie ensaios fotográficos com IA, escolha suas fotos e transforme-as em vídeos.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f0e9",
    theme_color: "#171310",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
