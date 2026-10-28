"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, requireAdmin } from "@/lib/auth";
import {
  crearAlumno,
  actualizarAlumno,
  getAlumnoById,
  eliminarAlumno,
} from "@/lib/mock-data";
import { CARRERAS } from "@/lib/constants";

export type AlumnoFormState =
  | { error?: string; errors?: { nombre?: string } }
  | undefined;

function opt(formData: FormData, key: string): string | undefined {
  const v = String(formData.get(key) ?? "").trim();
  return v || undefined;
}

export async function crearAlumnoAction(
  _prev: AlumnoFormState,
  formData: FormData,
): Promise<AlumnoFormState> {
  const user = await requireUser();
  const nombre = String(formData.get("nombre") ?? "").trim();

  const esAdmin = user.rol === "ADMIN";
  const alumno = await crearAlumno({
    nombre,
    carrera: String(formData.get("carrera") ?? "") || CARRERAS[0],
    zonaHoraria: String(formData.get("zonaHoraria") ?? ""),
    // El contacto solo lo puede cargar un admin.
    email: esAdmin ? opt(formData, "email") : undefined,
    telefono: esAdmin ? opt(formData, "telefono") : undefined,
    notas: opt(formData, "notas"),
  });
  revalidatePath("/panel/alumnos");
  redirect(`/panel/alumnos/${alumno.id}`);
}

export async function actualizarAlumnoAction(
  _prev: AlumnoFormState,
  formData: FormData,
): Promise<AlumnoFormState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();

  // Un profe no puede ver ni modificar el contacto: se conserva el existente.
  const esAdmin = user.rol === "ADMIN";
  const previo = await getAlumnoById(id);
  const alumno = await actualizarAlumno(id, {
    nombre,
    carrera: String(formData.get("carrera") ?? "") || CARRERAS[0],
    zonaHoraria: String(formData.get("zonaHoraria") ?? ""),
    email: esAdmin ? opt(formData, "email") : previo?.email,
    telefono: esAdmin ? opt(formData, "telefono") : previo?.telefono,
    notas: opt(formData, "notas"),
  });
  if (!alumno) return { error: "No se encontró el alumno." };

  revalidatePath("/panel/alumnos");
  revalidatePath(`/panel/alumnos/${id}`);
  redirect(`/panel/alumnos/${id}`);
}

export async function eliminarAlumnoAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await eliminarAlumno(id);
  revalidatePath("/panel/alumnos");
  redirect("/panel/alumnos");
}
