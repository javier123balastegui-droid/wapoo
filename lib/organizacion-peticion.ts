import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import type { Moneda } from "@/lib/utils";
import { ZONA_ARGENTINA } from "@/lib/fechas";
import {
  getOrganizacion,
  monedaDe,
  normalizarDominio,
  orgPorDefecto,
  orgPorDominio,
  type Organizacion,
} from "@/lib/organizacion";

// Aparte de lib/organizacion.ts porque usa lo que solo existe durante una
// petición web (headers, notFound): así los scripts de prueba, que corren
// fuera de Next, pueden seguir usando el resto.

/**
 * La academia de la página que se está mostrando, por el dominio con el que
 * entró la visita. null si el dominio no es de ninguna academia.
 *
 * En desarrollo (localhost) no hay dominio que buscar: se usa la academia
 * por defecto, para poder probar la web en la compu.
 */
export const orgDeLaPeticion = cache(async (): Promise<Organizacion | null> => {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const dominio = normalizarDominio(host);
  if (
    process.env.NODE_ENV === "development" &&
    (dominio === "localhost" || dominio === "127.0.0.1")
  ) {
    return getOrganizacion(await orgPorDefecto());
  }
  return orgPorDominio(dominio);
});

/** Igual que orgDeLaPeticion, pero un dominio desconocido es "no encontrado". */
export async function requireOrgDeLaPeticion(): Promise<Organizacion> {
  const org = await orgDeLaPeticion();
  if (!org) notFound();
  return org;
}

/** La moneda de la academia de quien está usando el panel (una vez por
 *  pantalla). */
export const monedaDelPanel = cache(async (): Promise<Moneda> => {
  const user = await getCurrentUser();
  if (!user) return { moneda: "ARS", locale: "es-AR" };
  return monedaDe(await getOrganizacion(user.organizacionId));
});

/** La zona horaria de la academia de quien está usando el panel (una vez por
 *  pantalla). */
export const zonaDelPanel = cache(async (): Promise<string> => {
  const user = await getCurrentUser();
  if (!user) return ZONA_ARGENTINA;
  return (await getOrganizacion(user.organizacionId)).zonaHoraria;
});
