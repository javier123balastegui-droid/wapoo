"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { hoyEn } from "@/lib/fechas";
import { zonaDelPanel } from "@/lib/organizacion-peticion";
import {
  crearSeguimiento,
  actualizarSeguimiento,
  eliminarSeguimiento,
} from "@/lib/mock-data";

export type SeguimientoFormState = { ok?: boolean; error?: string } | undefined;

function campos(formData: FormData, zona: string) {
  const fecha = String(formData.get("fecha") ?? "").trim();
  return {
    fecha: fecha || hoyEn(zona),
    tema: String(formData.get("tema") ?? "").trim(),
    desempeno: String(formData.get("desempeno") ?? "").trim(),
    aReforzar: String(formData.get("aReforzar") ?? "").trim(),
  };
}

export async function crearSeguimientoAction(
  _prev: SeguimientoFormState,
  formData: FormData,
): Promise<SeguimientoFormState> {
  const user = await requireUser();
  const alumnoId = String(formData.get("alumnoId") ?? "");
  if (!alumnoId) return { error: "Falta identificar al alumno." };

  const r = await crearSeguimiento({
    alumnoId,
    ...campos(formData, await zonaDelPanel()),
    autorId: user.id,
    autorNombre: user.nombre,
  });
  if (!r) {
    return {
      error:
        "No se pudo guardar. Si es la primera vez, falta crear la tabla de seguimientos en Supabase (ver instrucciones).",
    };
  }
  revalidatePath(`/panel/alumnos/${alumnoId}`);
  return { ok: true };
}

export async function actualizarSeguimientoAction(
  _prev: SeguimientoFormState,
  formData: FormData,
): Promise<SeguimientoFormState> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const alumnoId = String(formData.get("alumnoId") ?? "");
  const r = await actualizarSeguimiento(id, campos(formData, await zonaDelPanel()));
  if (!r) return { error: "No se pudo actualizar la entrada." };
  revalidatePath(`/panel/alumnos/${alumnoId}`);
  return { ok: true };
}

export async function eliminarSeguimientoAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const alumnoId = String(formData.get("alumnoId") ?? "");
  await eliminarSeguimiento(id);
  revalidatePath(`/panel/alumnos/${alumnoId}`);
}
