"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { crearCarrera, eliminarCarrera, setCarreraActiva } from "@/lib/carreras";

export type CarreraFormState = { error?: string; ok?: string } | undefined;

function refrescar() {
  // La lista se usa en el panel y en el formulario público de la web.
  revalidatePath("/panel/carreras");
  revalidatePath("/panel/alumnos");
  revalidatePath("/");
}

export async function crearCarreraAction(
  _prev: CarreraFormState,
  formData: FormData,
): Promise<CarreraFormState> {
  const { organizacionId: orgId } = await requireAdmin();
  const nombre = String(formData.get("nombre") ?? "").trim();
  try {
    await crearCarrera(orgId, nombre);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo agregar." };
  }
  refrescar();
  return { ok: `Se agregó ${nombre}.` };
}

export async function cambiarEstadoCarreraAction(formData: FormData) {
  const { organizacionId: orgId } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setCarreraActiva(orgId, id, formData.get("activa") === "si");
  refrescar();
}

export async function eliminarCarreraAction(formData: FormData) {
  const { organizacionId: orgId } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await eliminarCarrera(orgId, id);
  refrescar();
}
