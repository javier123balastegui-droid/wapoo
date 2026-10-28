"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  crearClase,
  actualizarClase,
  eliminarClase,
  setEstadoPago,
  setEstadoRealizacion,
  getClasesDeProfeEnFecha,
  getClaseById,
  getPrecios,
  setAlumnosDeClase,
  simularCambioAlumnos,
} from "@/lib/mock-data";
import { montoTexto } from "@/lib/utils";
import { inicioValido } from "@/lib/horarios";
import { precioAlumno } from "@/lib/precios";
import { hhmm, buscarChoque } from "@/lib/disponibilidad";
import type { EstadoPago, EstadoRealizacion } from "@/lib/types";
import { getOrganizacion, reglasDe, monedaDe } from "@/lib/organizacion";
import { duracionValida, mensajeDuracionInvalida } from "@/lib/agenda-reglas";

export type ClaseErrors = {
  profeId?: string;
  fecha?: string;
  inicioMin?: string;
  temaId?: string;
  alumnoIds?: string;
};

export type ClaseFormState =
  | { error?: string; errors?: ClaseErrors }
  | undefined;

function parseAlumnoIds(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export async function crearClaseAction(
  _prev: ClaseFormState,
  formData: FormData,
): Promise<ClaseFormState> {
  const { organizacionId: orgId } = await requireAdmin();

  const tipo = formData.get("tipo") === "GRUPAL" ? "GRUPAL" : "INDIVIDUAL";
  const profeId = String(formData.get("profeId") ?? "");
  const fecha = String(formData.get("fecha") ?? "");
  // Antes acá solo pasaban 60, 90 y 120: cualquier otra duración (las que
  // ofrece el formulario y agenda el bot) se guardaba en silencio como 60.
  const org = await getOrganizacion(orgId);
  const reglas = reglasDe(org);
  const duracion = Number(formData.get("duracion"));
  const inicioRaw = String(formData.get("inicioMin") ?? "");
  const temaId = String(formData.get("temaId") ?? "");
  const alumnoIds = parseAlumnoIds(formData.get("alumnoIds"));

  const errors: ClaseErrors = {};
  if (!profeId) errors.profeId = "Seleccioná un profesor.";
  if (!fecha) errors.fecha = "Seleccioná una fecha.";
  if (inicioRaw === "") errors.inicioMin = "Seleccioná un horario.";
  if (!temaId) errors.temaId = "Seleccioná un tema.";
  if (alumnoIds.length === 0)
    errors.alumnoIds = "Seleccioná al menos un alumno.";
  if (!duracionValida(duracion, reglas)) errors.inicioMin = mensajeDuracionInvalida(reglas);
  if (Object.keys(errors).length > 0) return { errors };

  const inicioMin = Number(inicioRaw);
  const ocupados = (await getClasesDeProfeEnFecha(profeId, fecha)).map((c) => ({
    inicioMin: c.inicioMin,
    duracion: c.duracion,
  }));
  if (!inicioValido(inicioMin, duracion, ocupados, reglas)) {
    return {
      errors: {
        inicioMin: `Ese horario no entra antes del cierre (${hhmm(reglas.cierre)}). Elegí uno más temprano.`,
      },
    };
  }

  await crearClase(orgId, { tipo, temaId, fecha, inicioMin, duracion, profeId, alumnoIds });
  revalidatePath("/panel/agenda");
  redirect("/panel/agenda");
}

export type EditarClaseState =
  | {
      error?: string;
      /** El error es un choque de horarios: se puede reintentar forzando. */
      superposicion?: boolean;
      /** Se está sacando a un alumno que ya había señado o pagado. */
      bajasConPago?: boolean;
    }
  | undefined;

/** Edición de una clase (solo admin): asigna profe/tema, ajusta día/hora/tipo.
 *  El profe y el tema pueden quedar sin asignar (vacío → null). */
export async function actualizarClaseAction(
  _prev: EditarClaseState,
  formData: FormData,
): Promise<EditarClaseState> {
  const { organizacionId: orgId } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const tipo = formData.get("tipo") === "GRUPAL" ? "GRUPAL" : "INDIVIDUAL";
  const profeId = String(formData.get("profeId") ?? "");
  const temaId = String(formData.get("temaId") ?? "");
  const fecha = String(formData.get("fecha") ?? "");
  // Antes acá solo pasaban 60, 90 y 120: cualquier otra duración (las que
  // ofrece el formulario y agenda el bot) se guardaba en silencio como 60.
  const org = await getOrganizacion(orgId);
  const reglas = reglasDe(org);
  const duracion = Number(formData.get("duracion"));
  const inicioMin = Number(formData.get("inicioMin"));
  const alumnoIds = parseAlumnoIds(formData.get("alumnoIds"));

  if (!fecha) return { error: "Elegí una fecha." };
  if (!Number.isFinite(inicioMin)) return { error: "Elegí un horario." };
  if (!duracionValida(duracion, reglas)) return { error: mensajeDuracionInvalida(reglas) };
  if (alumnoIds.length === 0)
    return { error: "La clase tiene que tener al menos un alumno." };
  // Antes acá no se validaba nada: se podía dejar una clase a las 3 de la
  // mañana o pisando a otra sin ningún aviso.
  if (inicioMin < reglas.apertura || inicioMin + duracion > reglas.cierre)
    return {
      error: `El horario tiene que estar entre las ${hhmm(reglas.apertura)} y las ${hhmm(reglas.cierre)}. Con ${duracion} minutos, ese inicio no entra.`,
    };

  // Superposición: al admin se le AVISA pero se le permite (a diferencia del
  // portal del alumno, donde se bloquea). Para forzarla, reenvía con "confirmar".
  const forzar = String(formData.get("confirmarSuperposicion") ?? "") === "si";
  if (!forzar) {
    const choque = await buscarChoque(orgId, fecha, inicioMin, duracion, id);
    if (choque)
      return {
        error: `Ojo: se superpone con otra clase de ese día (${hhmm(choque.inicioMin)} a ${hhmm(choque.inicioMin + choque.duracion)}). Si querés guardarla igual, tocá "Guardar de todos modos".`,
        superposicion: true,
      };
  }

  // Sacar un alumno borra su inscripción Y su pago. Si ya había señado o pagado,
  // eso sería perder plata registrada: se avisa y se pide confirmación aparte.
  const bajasOk = String(formData.get("confirmarBajas") ?? "") === "si";
  if (!bajasOk) {
    const { quitadosConPago } = await simularCambioAlumnos(id, alumnoIds);
    if (quitadosConPago.length > 0) {
      const detalle = quitadosConPago
        .map(
          (q) =>
            `${q.nombre} (${q.estado === "PAGADO" ? "pagó" : "señó"} ${montoTexto(q.monto, monedaDe(org))})`,
        )
        .join(", ");
      return {
        error: `Ojo: al sacar a ${detalle} se borra ese pago del sistema. Si igual querés sacarlo, tocá "Sacar y borrar el pago".`,
        bajasConPago: true,
      };
    }
  }

  const clase = await actualizarClase(orgId, id, {
    tipo,
    temaId,
    fecha,
    inicioMin,
    duracion,
    profeId,
  });
  if (!clase) return { error: "No se encontró la clase a editar." };

  // Después de actualizar la clase, porque recotiza con la duración nueva.
  await setAlumnosDeClase(orgId, id, alumnoIds);

  revalidatePath("/panel/agenda");
  revalidatePath(`/panel/agenda/${id}`);
  redirect(`/panel/agenda/${id}`);
}

export async function eliminarClaseAction(formData: FormData) {
  const { organizacionId: orgId } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await eliminarClase(orgId, id);
  revalidatePath("/panel/agenda");
  redirect("/panel/agenda");
}

const ESTADOS_VALIDOS: EstadoPago[] = ["SIN_PAGAR", "SENADO", "PAGADO"];

export async function actualizarPagoAction(formData: FormData) {
  await requireAdmin();
  const claseId = String(formData.get("claseId") ?? "");
  const alumnoId = String(formData.get("alumnoId") ?? "");
  const estadoRaw = String(formData.get("estado") ?? "");
  const estado = (ESTADOS_VALIDOS as string[]).includes(estadoRaw)
    ? (estadoRaw as EstadoPago)
    : "SIN_PAGAR";
  // El monto se calcula solo, con los precios cargados:
  //   - Señó: el valor de la seña (fijo, no depende de la duración).
  //   - Pagó completo: precio POR HORA × las horas que dura la clase, según la
  //     modalidad y cuántos alumnos son (2 vs 3 o más).
  let monto: number | undefined;
  if (estado === "SENADO") {
    monto = (await getPrecios()).valorSena;
  } else if (estado === "PAGADO") {
    const [precios, clase] = await Promise.all([
      getPrecios(),
      getClaseById(claseId),
    ]);
    if (clase) {
      monto = precioAlumno(
        precios,
        clase.tipo,
        clase.alumnoIds.length,
        clase.duracion,
      );
    }
  }

  await setEstadoPago(claseId, alumnoId, estado, monto);
  revalidatePath(`/panel/agenda/${claseId}`);
  revalidatePath("/panel/agenda");
  revalidatePath("/panel/finanzas");
}

const ESTADOS_REALIZACION: EstadoRealizacion[] = [
  "PENDIENTE",
  "REALIZADA",
  "REAGENDADA",
  "CANCELADA",
  "AUSENTE",
];

/** Marca si la clase se realizó / reagendó / canceló / no se conectó. Solo admin. */
export async function actualizarEstadoRealizacionAction(formData: FormData) {
  await requireAdmin();
  const claseId = String(formData.get("claseId") ?? "");
  const raw = String(formData.get("estadoRealizacion") ?? "");
  const estado = (ESTADOS_REALIZACION as string[]).includes(raw)
    ? (raw as EstadoRealizacion)
    : "PENDIENTE";
  await setEstadoRealizacion(claseId, estado);
  revalidatePath(`/panel/agenda/${claseId}`);
  revalidatePath("/panel/agenda");
}
