"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { agregarDiaSinClase, quitarDiaSinClase } from "@/lib/disponibilidad";

export type DiaFormState = { error?: string; ok?: string } | undefined;

function refrescar() {
  revalidatePath("/panel/dias-sin-clase");
  revalidatePath("/panel/agenda");
  // La web del alumno deja de ofrecer horarios de ese día.
  revalidatePath("/alumno/agendar");
}

export async function agregarDiaSinClaseAction(
  _prev: DiaFormState,
  formData: FormData,
): Promise<DiaFormState> {
  const { organizacionId: orgId } = await requireAdmin();
  const desde = String(formData.get("desde") ?? "");
  const hasta = String(formData.get("hasta") ?? "") || desde;
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (!desde) return { error: "Elegí el día." };
  if (hasta < desde) return { error: "El día final no puede ser anterior al primero." };

  // Un rango corto se carga día por día (las vacaciones de un profe, por ejemplo).
  const dias: string[] = [];
  for (let d = new Date(`${desde}T00:00:00`); ; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    dias.push(iso);
    if (iso >= hasta || dias.length > 120) break;
  }
  try {
    for (const fecha of dias) await agregarDiaSinClase(orgId, fecha, motivo);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
  refrescar();
  return {
    ok: dias.length === 1 ? "Día cargado." : `${dias.length} días cargados.`,
  };
}

export async function quitarDiaSinClaseAction(formData: FormData) {
  const { organizacionId: orgId } = await requireAdmin();
  const fecha = String(formData.get("fecha") ?? "");
  if (!fecha) return;
  await quitarDiaSinClase(orgId, fecha);
  refrescar();
}
