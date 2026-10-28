"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getClaseById, guardarReporte } from "@/lib/mock-data";

export type ReporteFormState = { error?: string } | undefined;

export async function guardarReporteAction(
  _prev: ReporteFormState,
  formData: FormData,
): Promise<ReporteFormState> {
  const user = await requireUser();
  const claseId = String(formData.get("claseId") ?? "");
  const clase = await getClaseById(claseId);
  if (!clase) return { error: "No se encontró la clase." };
  // Solo el profe asignado o un admin pueden cargar el reporte
  if (user.rol !== "ADMIN" && clase.profeId !== user.id) {
    return { error: "No tenés permiso para cargar el reporte de esta clase." };
  }

  const porAlumno = clase.alumnoIds.map((aid) => ({
    alumnoId: aid,
    queLeCosto: String(formData.get(`qlc_${aid}`) ?? "").trim(),
    enfasis: String(formData.get(`enf_${aid}`) ?? "").trim(),
    loQueMasLeCuesta: String(formData.get(`lqmlc_${aid}`) ?? "").trim(),
  }));

  await guardarReporte(claseId, {
    metodo: String(formData.get("metodo") ?? "").trim(),
    temaDado: String(formData.get("temaDado") ?? "").trim(),
    observaciones: String(formData.get("observaciones") ?? "").trim(),
    porAlumno,
  });

  revalidatePath(`/panel/agenda/${claseId}`);
  revalidatePath(`/panel/agenda/reporte/${claseId}`);
  clase.alumnoIds.forEach((aid) => revalidatePath(`/panel/alumnos/${aid}`));
  redirect(`/panel/agenda/${claseId}`);
}
