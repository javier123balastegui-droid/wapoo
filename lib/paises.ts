/**
 * Países donde puede estar una academia: cada uno fija su moneda, cómo se
 * escriben los números y su zona horaria. Se elige en Panel → Plataforma.
 * Sin dependencias del servidor: lo usa el formulario.
 *
 * En los países con más de un huso se toma el de la capital; si alguna vez
 * hace falta otro, se suma acá como otra opción.
 */
export type Pais = {
  id: string;
  nombre: string;
  moneda: string;
  locale: string;
  zona: string;
};

export const PAISES: Pais[] = [
  { id: "AR", nombre: "Argentina", moneda: "ARS", locale: "es-AR", zona: "America/Argentina/Cordoba" },
  { id: "UY", nombre: "Uruguay", moneda: "UYU", locale: "es-UY", zona: "America/Montevideo" },
  { id: "CL", nombre: "Chile", moneda: "CLP", locale: "es-CL", zona: "America/Santiago" },
  { id: "PY", nombre: "Paraguay", moneda: "PYG", locale: "es-PY", zona: "America/Asuncion" },
  { id: "BO", nombre: "Bolivia", moneda: "BOB", locale: "es-BO", zona: "America/La_Paz" },
  { id: "PE", nombre: "Perú", moneda: "PEN", locale: "es-PE", zona: "America/Lima" },
  { id: "EC", nombre: "Ecuador", moneda: "USD", locale: "es-EC", zona: "America/Guayaquil" },
  { id: "CO", nombre: "Colombia", moneda: "COP", locale: "es-CO", zona: "America/Bogota" },
  { id: "MX", nombre: "México (centro)", moneda: "MXN", locale: "es-MX", zona: "America/Mexico_City" },
  { id: "ES", nombre: "España", moneda: "EUR", locale: "es-ES", zona: "Europe/Madrid" },
];

/** El país que corresponde a la configuración de una academia, o null si es
 *  una combinación que no está en la lista (cargada a mano). */
export function paisDe(moneda: string, zona: string): Pais | null {
  return PAISES.find((p) => p.moneda === moneda && p.zona === zona) ?? null;
}

/** Monedas en las que se le puede cobrar el abono a una academia: las de
 *  los países de la lista, y dólares. */
export const MONEDAS_ABONO: string[] = [...new Set(["ARS", "USD", ...PAISES.map((p) => p.moneda)])];
