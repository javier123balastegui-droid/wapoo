import type { MetadataRoute } from "next";
import { orgDeLaPeticion } from "@/lib/organizacion-peticion";

// Manifest de la PWA: permite "instalar" la web como app en el celular. Lleva
// el nombre y los colores de la academia del dominio.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const org = await orgDeLaPeticion();
  const nombre = org?.nombre ?? "Academia";
  return {
    name: nombre,
    // Academia Demo conserva el nombre corto que ya tenía instalado.
    short_name: org?.slug === "academia-demo" ? "Academia Demo" : nombre,
    description:
      `Gestión de la academia ${nombre}` + (org?.directora ? ` (Dir. ${org.directora}).` : "."),
    start_url: "/panel",
    scope: "/",
    display: "standalone",
    background_color: org?.colores.cream ?? "#fbf7f4",
    theme_color: org?.colores.canvas ?? "#AE6675",
    lang: "es",
    icons: [
      {
        src: "/icon-any.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
