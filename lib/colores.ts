/**
 * Colores de una academia.
 *
 * La web usa 16 tonos (globals.css), pero una academia elige solo dos: el
 * FONDO (canvas: el color de las páginas, con texto claro encima) y el
 * ACENTO (blush: botones y detalles, con texto oscuro encima). Las variantes
 * más claras y más oscuras salen de esos dos. El resto (crema, tinta,
 * líneas) son neutros y quedan como están.
 *
 * Sin dependencias del servidor: lo usa también el formulario para la vista
 * previa.
 */

type Rgb = [number, number, number];

export const PATRON_HEX = /^#[0-9a-f]{6}$/i;

function aRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function aHex([r, g, b]: Rgb): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
}

/** Mezcla dos colores: t = 0 es `a`, t = 1 es `b`. */
function mezclar(a: string, b: string, t: number): string {
  const [x, y] = [aRgb(a), aRgb(b)];
  return aHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as Rgb);
}

/** Luminancia relativa (WCAG). */
function luminancia(hex: string): number {
  const [r, g, b] = aRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste entre dos colores (1 a 21). 4,5 es lo recomendado para texto. */
export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** El texto claro que va sobre el fondo y el oscuro que va sobre el acento
 *  (los mismos de globals.css). */
export const TEXTO_CLARO = "#fbf7f4";
export const TEXTO_OSCURO = "#3a2e2a";

/** Los tonos que salen del fondo y del acento, con los nombres de
 *  globals.css (--color-…). */
export function derivarPaleta(fondo: string, acento: string): Record<string, string> {
  return {
    canvas: fondo.toLowerCase(),
    "canvas-deep": mezclar(fondo, "#000000", 0.13),
    blush: acento.toLowerCase(),
    "blush-deep": mezclar(acento, "#000000", 0.07),
    "blush-soft": mezclar(acento, "#ffffff", 0.7),
    "surface-rose": mezclar(acento, "#ffffff", 0.93),
  };
}

/** Qué tan legible queda la combinación. null = bien. */
export function problemaDeContraste(fondo: string, acento: string): { grave: boolean; mensaje: string } | null {
  const sobreFondo = contraste(fondo, TEXTO_CLARO);
  const sobreAcento = contraste(acento, TEXTO_OSCURO);
  if (sobreFondo < 3) {
    return { grave: true, mensaje: "El fondo es muy claro: el texto blanco de encima no se lee. Elegí uno más oscuro." };
  }
  if (sobreAcento < 3) {
    return { grave: true, mensaje: "El acento es muy oscuro: el texto de los botones no se lee. Elegí uno más claro." };
  }
  if (sobreFondo < 3.5 || sobreAcento < 4.5) {
    return { grave: false, mensaje: "Se lee, pero con poco contraste. Si podés, oscurecé un poco el fondo o aclará el acento." };
  }
  return null;
}

/** Paletas sugeridas para arrancar. La primera es la de Academia Demo. */
export const PALETAS: { nombre: string; fondo: string; acento: string }[] = [
  { nombre: "Rosa viejo", fondo: "#ae6675", acento: "#e8b4b8" },
  { nombre: "Azul", fondo: "#3f5f8a", acento: "#a9c4e8" },
  { nombre: "Verde", fondo: "#4f7a64", acento: "#b5d8c2" },
  { nombre: "Violeta", fondo: "#6e5a8f", acento: "#cdbbe6" },
  { nombre: "Terracota", fondo: "#a35f45", acento: "#f0c3a8" },
  { nombre: "Grafito", fondo: "#4a4e57", acento: "#d5d9e0" },
];

/** Los de globals.css, para una academia que todavía no eligió. */
export const FONDO_POR_DEFECTO = "#ae6675";
export const ACENTO_POR_DEFECTO = "#e8b4b8";
