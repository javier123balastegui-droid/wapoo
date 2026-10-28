import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Une clases de Tailwind resolviendo conflictos. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** La moneda de una academia: código (ARS, UYU…) y cómo se escriben los
 *  números (es-AR, es-UY…). Ver monedaDe en lib/organizacion.ts. */
export type Moneda = { moneda: string; locale: string };

/** En pesos argentinos, sin decimales (como siempre); en otras monedas, con
 *  hasta dos decimales si hacen falta. */
function opcionesNumero(m: Moneda): Intl.NumberFormatOptions {
  return m.moneda === "ARS"
    ? { maximumFractionDigits: 0 }
    : { minimumFractionDigits: 0, maximumFractionDigits: 2 };
}

/** Un monto para mostrar en el panel o la web: "$ 9.500". */
export function formatMoneda(amount: number, m: Moneda): string {
  return new Intl.NumberFormat(m.locale, {
    style: "currency",
    currency: m.moneda,
    ...opcionesNumero(m),
  }).format(amount);
}

/** Un monto dentro de un texto (el bot, las notificaciones): "$9.500", con
 *  el signo pegado como se escribe en un mensaje. */
export function montoTexto(amount: number, m: Moneda): string {
  if (m.moneda === "ARS") return `$${amount.toLocaleString(m.locale)}`;
  return new Intl.NumberFormat(m.locale, {
    style: "currency",
    currency: m.moneda,
    currencyDisplay: "narrowSymbol",
    ...opcionesNumero(m),
  }).format(amount);
}

/** Convierte minutos desde medianoche a "HH:mm" (ej: 540 → "09:00"). */
export function minutosAHora(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Iniciales para un avatar a partir de un nombre. */
export function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Convierte el texto de una fecha en un Date para mostrarla.
 *
 * OJO con las fechas "sueltas" tipo "2026-08-03" (las que guarda la base): si
 * se las pasa directo a `new Date()`, JavaScript las toma como medianoche en
 * Londres, y al mostrarlas en un celular argentino resta 3 horas y muestra
 * ¡el día anterior! Por eso se arman a mano, sin zona horaria de por medio.
 */
function paraMostrar(iso: string): Date {
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  if (soloFecha) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(iso);
}

/** Formatea una fecha ISO a algo legible en español (ej: "mié 4 jun"). */
export function fechaCorta(iso: string): string {
  return paraMostrar(iso).toLocaleDateString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Formatea una fecha ISO larga (ej: "miércoles 4 de junio de 2026"). */
export function fechaLarga(iso: string): string {
  return paraMostrar(iso).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
