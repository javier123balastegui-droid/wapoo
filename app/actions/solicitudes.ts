"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  crearSolicitud,
  getSolicitudById,
  setEstadoSolicitud,
  eliminarSolicitud,
  crearAlumno,
} from "@/lib/mock-data";
import type { EstadoSolicitud, PreferenciaModalidad } from "@/lib/types";
import { orgDeLaPeticion } from "@/lib/organizacion-peticion";

export type InscripcionState =
  | { ok?: boolean; error?: string; errors?: { nombre?: string; contacto?: string } }
  | undefined;

/** Acción PÚBLICA (sin login): la usa el formulario de la landing. */
export async function crearSolicitudAction(
  _prev: InscripcionState,
  formData: FormData,
): Promise<InscripcionState> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const contacto = String(formData.get("contacto") ?? "").trim();

  const errors: { nombre?: string; contacto?: string } = {};
  if (!nombre) errors.nombre = "Ingresá tu nombre.";
  if (!contacto) errors.contacto = "Ingresá un email o WhatsApp de contacto.";
  if (Object.keys(errors).length > 0) return { errors };

  const pref = formData.get("preferencia");
  const preferencia: PreferenciaModalidad =
    pref === "GRUPAL" ? "GRUPAL" : pref === "INDIVIDUAL" ? "INDIVIDUAL" : "INDISTINTO";

  try {
    // La inscripción es de la academia del dominio desde el que se mandó.
    const org = await orgDeLaPeticion();
    if (!org) throw new Error("Dominio sin academia");
    await crearSolicitud(org.id, {
      nombre,
      contacto,
      carrera: String(formData.get("carrera") ?? ""),
      temaInteres: String(formData.get("temaInteres") ?? "").trim(),
      preferencia,
      mensaje: String(formData.get("mensaje") ?? "").trim() || undefined,
    });
  } catch {
    return {
      error:
        "No pudimos enviar tu inscripción. Probá de nuevo en un momento, por favor.",
    };
  }

  revalidatePath("/panel/solicitudes");
  revalidatePath("/panel");
  return { ok: true };
}

const ESTADOS: EstadoSolicitud[] = [
  "NUEVA",
  "CONTACTADA",
  "CONVERTIDA",
  "DESCARTADA",
];

export async function cambiarEstadoSolicitudAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const estado = String(formData.get("estado") ?? "");
  if ((ESTADOS as string[]).includes(estado)) {
    await setEstadoSolicitud(id, estado as EstadoSolicitud);
  }
  revalidatePath("/panel/solicitudes");
  revalidatePath("/panel");
}

/** Convierte la solicitud en un Alumno y lleva a crear la Clase con el alumno ya elegido. */
export async function convertirSolicitudAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const s = await getSolicitudById(id);
  if (!s) redirect("/panel/solicitudes");

  const esEmail = s.contacto.includes("@");
  const alumno = await crearAlumno({
    nombre: s.nombre,
    carrera: s.carrera,
    email: esEmail ? s.contacto : undefined,
    telefono: esEmail ? undefined : s.contacto,
    notas:
      `Vino del formulario de inscripción. Interés: ${s.temaInteres || "—"} (${s.preferencia}).` +
      (s.mensaje ? ` Mensaje: ${s.mensaje}` : ""),
  });
  await setEstadoSolicitud(id, "CONVERTIDA");

  revalidatePath("/panel/solicitudes");
  revalidatePath("/panel/alumnos");
  redirect(`/panel/agenda/nueva?alumno=${alumno.id}`);
}

export async function eliminarSolicitudAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await eliminarSolicitud(id);
  revalidatePath("/panel/solicitudes");
  revalidatePath("/panel");
}
