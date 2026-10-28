import type { Metadata, Viewport } from "next";
import { cssDeColores } from "@/lib/organizacion";
import { orgDeLaPeticion } from "@/lib/organizacion-peticion";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

// Serif editorial elegante para títulos (con cursivas para énfasis)
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

// Sans limpia y legible para cuerpo y datos
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/** Todo lleva la marca de la academia del dominio con el que se entra. Un
 *  dominio desconocido muestra un título neutro (y las páginas, "no
 *  encontrado"). */
export async function generateMetadata(): Promise<Metadata> {
  const org = await orgDeLaPeticion();
  const nombre = org?.nombre ?? "Academia";
  const materia = org?.materia.trim().toLowerCase();
  return {
    title: `${nombre} · Gestión`,
    description:
      `Plataforma interna de ${nombre}` +
      (org?.directora ? ` (Dir. ${org.directora})` : "") +
      ` para gestionar clases${materia ? ` de ${materia}` : ""}: agenda, alumnos, temario y reportes.`,
    appleWebApp: {
      capable: true,
      title: nombre,
      statusBarStyle: "default",
    },
    icons: {
      icon: "/icon-any.png",
      apple: "/icon-maskable.png",
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const org = await orgDeLaPeticion();
  return { themeColor: org?.colores.canvas ?? "#AE6675" };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const org = await orgDeLaPeticion();
  const colores = org ? cssDeColores(org) : "";
  return (
    <html
      lang="es"
      className={`${cormorant.variable} ${inter.variable} h-full`}
    >
      <body className="min-h-full bg-canvas font-sans text-ink antialiased">
        {/* Colores de la academia (pisan los de globals.css). */}
        {colores && <style>{colores}</style>}
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
