"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  getAlumnoPorCodigo,
  pedirUnirseAClase,
  crearClaseDeAlumno,
} from "@/lib/portal-data";
import { ALUMNO_COOKIE, getAlumnoSesion } from "@/lib/portal-auth";
import { hoyEn } from "@/lib/fechas";
import { getOrganizacion, ventanaDeOrg, horariosEnPalabras, reglasDe, zonaDe } from "@/lib/organizacion";
import { orgDeLaPeticion } from "@/lib/organizacion-peticion";
import { motivoDiaSinClase } from "@/lib/disponibilidad";
import {
  horariosDelDiaParaAlumno,
  buscarChoque,
  hhmm,
  type SlotAlumno,
} from "@/lib/disponibilidad";
import { duracionValida } from "@/lib/agenda-reglas";

export type IngresoState = { error?: string } | undefined;

export async function ingresarAlumnoAction(
  _prev: IngresoState,
  formData: FormData,
): Promise<IngresoState> {
  const codigo = String(formData.get("codigo") ?? "")
    .trim()
    .toLowerCase();
  if (!codigo) return { error: "Ingresá tu código de acceso." };

  // El código es único en toda la base, pero solo sirve en el portal de SU
  // academia: en el dominio de otra se trata como un código que no existe.
  const [alumno, org] = await Promise.all([getAlumnoPorCodigo(codigo), orgDeLaPeticion()]);
  if (!alumno || !org || alumno.organizacionId !== org.id) {
    return {
      error:
        "El código no es válido. Revisalo o pedí uno nuevo a la academia.",
    };
  }

  const c = await cookies();
  c.set(ALUMNO_COOKIE, alumno.codigoAcceso ?? codigo, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 60, // 60 días
  });
  redirect("/alumno/inicio");
}

export async function salirAlumnoAction() {
  const c = await cookies();
  c.delete(ALUMNO_COOKIE);
  redirect("/alumno");
}

export type PedirLugarState = { error?: string } | undefined;

/** El alumno pide lugar en una clase grupal ya agendada. Queda PENDIENTE de que
 *  el admin lo apruebe (lo inscribe) o lo rechace. No lo inscribe todavía.
 *  Si no se puede (ej: ya tiene otra clase a esa hora), devuelve el motivo para
 *  mostrárselo —antes el error se descartaba y el botón no hacía nada visible—. */
export async function pedirUnirseAClaseAction(
  _prev: PedirLugarState,
  formData: FormData,
): Promise<PedirLugarState> {
  const alumno = await getAlumnoSesion();
  if (!alumno) redirect("/alumno");
  const claseId = String(formData.get("claseId") ?? "");
  const r = await pedirUnirseAClase(alumno.organizacionId, alumno.id, claseId);
  if (!r.ok) return { error: r.error ?? "No se pudo pedir lugar. Probá de nuevo." };
  revalidatePath("/alumno/agendar");
  redirect("/alumno/agendar");
}

/** Horarios de ese día para esa duración, marcando cuáles están ocupados.
 *  Lo pide el formulario cada vez que el alumno cambia el día o la duración,
 *  para no ofrecerle horarios que se pisan con otra clase. */
export async function horariosDelDiaAction(
  fecha: string,
  duracion: number,
): Promise<SlotAlumno[]> {
  const alumno = await getAlumnoSesion();
  if (!alumno) return [];
  const reglas = reglasDe(await getOrganizacion(alumno.organizacionId));
  if (!fecha || !duracionValida(duracion, reglas)) return [];
  return horariosDelDiaParaAlumno(alumno.organizacionId, fecha, duracion);
}

export type AgendarState = { error?: string } | undefined;

/** El alumno pide una clase nueva eligiendo tipo + día + horario + duración.
 *  La clase se crea SIN profe (lo asigna el admin). */
export async function agendarClaseAction(
  _prev: AgendarState,
  formData: FormData,
): Promise<AgendarState> {
  const alumno = await getAlumnoSesion();
  if (!alumno) redirect("/alumno");

  const tipo = formData.get("tipo") === "GRUPAL" ? "GRUPAL" : "INDIVIDUAL";
  const fecha = String(formData.get("fecha") ?? "");
  const inicioMin = Number(formData.get("inicioMin"));
  const duracion = Number(formData.get("duracion"));

  if (!fecha) return { error: "Elegí un día." };
  if (fecha < hoyEn(await zonaDe(alumno.organizacionId)))
    return { error: "Elegí un día de hoy en adelante." };
  const dow = new Date(`${fecha}T00:00:00`).getDay();
  const org = await getOrganizacion(alumno.organizacionId);
  const ventana = ventanaDeOrg(org, dow);
  if (!ventana)
    return { error: `Ese día no hay clases. Atendemos ${horariosEnPalabras(org)}.` };
  const sinClase = await motivoDiaSinClase(alumno.organizacionId, fecha);
  if (sinClase !== null)
    return {
      error: `Ese día no se dan clases${sinClase ? ` (${sinClase})` : ""}. Elegí otro.`,
    };
  if (!duracionValida(duracion, reglasDe(org)))
    return { error: "Elegí una duración válida." };
  if (
    !Number.isFinite(inicioMin) ||
    inicioMin < ventana.apertura ||
    inicioMin + duracion > ventana.cierre
  )
    return {
      error: "Elegí un horario dentro del horario de atención de ese día.",
    };

  // No se puede agendar arriba de otra clase. Se valida acá (y de nuevo al
  // grabar) porque el horario pudo ocuparse mientras completaba el formulario.
  const choque = await buscarChoque(alumno.organizacionId, fecha, inicioMin, duracion);
  if (choque)
    return {
      error: `Ese horario ya está ocupado (hay una clase de ${hhmm(choque.inicioMin)} a ${hhmm(choque.inicioMin + choque.duracion)}). Elegí otro.`,
    };

  const r = await crearClaseDeAlumno(alumno.organizacionId, alumno.id, {
    tipo,
    fecha,
    inicioMin,
    duracion,
  });
  if (!r.ok) return { error: r.error ?? "No se pudo agendar. Probá de nuevo." };

  revalidatePath("/alumno/inicio");
  redirect("/alumno/inicio");
}
