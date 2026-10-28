import "server-only";
import { createAdminClient } from "./supabase/admin";
import { dbDeOrg } from "./supabase/org";
import { buscarChoque, solapan } from "./disponibilidad";
import { nombreDiaLargo, hoyEn } from "./fechas";
import type { Alumno, EstadoPago, TipoClase, EstadoRealizacion } from "./types";
import { zonaDe } from "./organizacion";

/** El alumno del portal, con la academia a la que pertenece: todo lo que
 *  hace en el portal es de esa academia. */
export type AlumnoPortal = Alumno & { organizacionId: string };

/**
 * Los avisos (push y WhatsApp) se cargan solo cuando hay que mandar uno.
 *
 * Este archivo lo importa cada pantalla del portal, y los avisos arrastran
 * web-push y el modulo de WhatsApp. Con el import arriba, esas librerias se
 * cargaban al levantar la funcion incluso para mostrar una lista de alumnos, y
 * eso se paga en el arranque en frio (medido: 1,14 s la primera visita contra
 * 250 ms las siguientes). Mismo criterio que en lib/bot/uso.ts.
 */
const notificarAdmins: typeof import("./push").notificarAdmins = async (...args) =>
  (await import("./push")).notificarAdmins(...args);
const avisarProfeDeCambio: typeof import("./bot/avisos-profe").avisarProfeDeCambio =
  async (...args) => (await import("./bot/avisos-profe")).avisarProfeDeCambio(...args);

// ============================================================
// Datos del PORTAL DE ALUMNOS. Los alumnos NO tienen cuenta de
// Supabase Auth: entran con un código personal. Por eso estas
// consultas usan el cliente admin (service key) y SIEMPRE filtran
// por el alumno de la sesión. Nunca exponen datos de otros alumnos.
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapAlumno(r: any): Alumno {
  return {
    id: r.id,
    nombre: r.nombre,
    carrera: r.carrera ?? "",
    email: r.email ?? undefined,
    telefono: r.telefono ?? undefined,
    notas: r.notas ?? undefined,
    codigoAcceso: r.codigo_acceso ?? undefined,
    creadoEn: r.creado_en,
  };
}

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
function ddmm(iso: string): string {
  const [, mo, d] = iso.split("-");
  return `${d}/${mo}`;
}
/** Nombre del alumno para los avisos. Si no se encuentra, texto neutro. */
async function nombreDeAlumno(s: any, alumnoId: string): Promise<string> {
  const { data } = await s
    .from("alumnos")
    .select("nombre")
    .eq("id", alumnoId)
    .maybeSingle();
  return data?.nombre || "Una alumna";
}

/** Busca un alumno por su código de acceso. Devuelve null si no existe
 *  (o si todavía no se configuró la service key / la columna).
 *
 *  Es la única consulta del portal sin organización, y a propósito: el código
 *  es único en toda la base, y es justamente lo que dice de qué academia es el
 *  alumno. Todo lo demás se consulta con la organización que devuelve esto. */
export async function getAlumnoPorCodigo(
  codigo: string,
): Promise<AlumnoPortal | null> {
  const code = codigo.trim().toLowerCase();
  if (!code) return null;
  const s = createAdminClient();
  if (!s) return null;
  const { data } = await s
    .from("alumnos")
    .select("*")
    .eq("codigo_acceso", code)
    .maybeSingle();
  if (!data?.organizacion_id) return null;
  return { ...mapAlumno(data), organizacionId: String(data.organizacion_id) };
}

export interface ClaseAlumnoVista {
  id: string;
  fecha: string;
  inicioMin: number;
  duracion: number;
  tipo: TipoClase;
  temaTitulo: string;
  /** Estado de la seña/pago DE ESTE alumno (no se exponen los de otros). */
  estadoPago: EstadoPago;
  estadoRealizacion: EstadoRealizacion;
}

/** Clases en las que está inscripto el alumno, con su propio estado de pago.
 *  No expone ningún dato de los demás alumnos de la clase. */
export async function getClasesDelAlumno(
  orgId: string,
  alumnoId: string,
): Promise<ClaseAlumnoVista[]> {
  const s = dbDeOrg(orgId);
  if (!s) return [];

  const { data: links } = await s
    .from("clase_alumnos")
    .select("clase_id")
    .eq("alumno_id", alumnoId);
  const claseIds = (links ?? []).map((l: any) => l.clase_id);
  if (claseIds.length === 0) return [];

  const [{ data: clases }, { data: pagos }] = await Promise.all([
    s.from("clases").select("*").in("id", claseIds),
    s
      .from("pagos")
      .select("clase_id, estado")
      .eq("alumno_id", alumnoId)
      .in("clase_id", claseIds),
  ]);

  const temaIds = Array.from(
    new Set((clases ?? []).map((c: any) => c.tema_id).filter(Boolean)),
  );
  const temasById = new Map<string, string>();
  if (temaIds.length > 0) {
    const { data: temas } = await s
      .from("temas")
      .select("id, titulo")
      .in("id", temaIds);
    for (const t of temas ?? []) temasById.set(t.id, t.titulo);
  }

  const pagoPorClase = new Map<string, EstadoPago>();
  for (const p of pagos ?? []) pagoPorClase.set(p.clase_id, p.estado);

  return (clases ?? [])
    .map(
      (c: any): ClaseAlumnoVista => ({
        id: c.id,
        fecha: c.fecha,
        inicioMin: c.inicio_min,
        duracion: c.duracion,
        tipo: c.tipo,
        temaTitulo: c.tema_id ? (temasById.get(c.tema_id) ?? "Clase") : "Clase",
        estadoPago: (pagoPorClase.get(c.id) ?? "SIN_PAGAR") as EstadoPago,
        estadoRealizacion: (c.estado_realizacion ??
          "PENDIENTE") as EstadoRealizacion,
      }),
    )
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.inicioMin - b.inicioMin);
}

export interface GrupoDisponible {
  id: string;
  fecha: string;
  inicioMin: number;
  duracion: number;
  temaTitulo: string;
  /** Estado del pedido de este alumno para esta clase (si ya pidió lugar). */
  estadoPedido: "PENDIENTE" | "RECHAZADA" | null;
}

/** Clases grupales futuras a las que el alumno puede pedir sumarse (en las que
 *  aún no está). Incluye el estado de su pedido. No expone a otros alumnos. */
export async function getGruposDisponibles(
  orgId: string,
  alumnoId: string,
): Promise<GrupoDisponible[]> {
  const s = dbDeOrg(orgId);
  if (!s) return [];
  const hoy = hoyEn(await zonaDe(orgId));

  const { data: clases } = await s
    .from("clases")
    .select("id, fecha, inicio_min, duracion, tema_id, tipo")
    .eq("tipo", "GRUPAL")
    .gte("fecha", hoy)
    .order("fecha")
    .order("inicio_min");
  if (!clases || clases.length === 0) return [];

  // Clases donde el alumno YA está inscripto (no las muestro como disponibles).
  const { data: mias } = await s
    .from("clase_alumnos")
    .select("clase_id")
    .eq("alumno_id", alumnoId);
  const misIds = new Set((mias ?? []).map((l: any) => l.clase_id));

  const disponibles = clases.filter((c: any) => !misIds.has(c.id));
  if (disponibles.length === 0) return [];

  // Estado de los pedidos del alumno (PENDIENTE / RECHAZADA) por clase.
  const { data: pedidos } = await s
    .from("solicitudes_union")
    .select("clase_id, estado")
    .eq("alumno_id", alumnoId);
  const estadoPorClase = new Map<string, string>();
  for (const p of pedidos ?? []) estadoPorClase.set(p.clase_id, p.estado);

  const temaIds = Array.from(
    new Set(disponibles.map((c: any) => c.tema_id).filter(Boolean)),
  );
  const temasById = new Map<string, string>();
  if (temaIds.length > 0) {
    const { data: temas } = await s
      .from("temas")
      .select("id, titulo")
      .in("id", temaIds);
    for (const t of temas ?? []) temasById.set(t.id, t.titulo);
  }

  return disponibles.map((c: any): GrupoDisponible => {
    const est = estadoPorClase.get(c.id);
    return {
      id: c.id,
      fecha: c.fecha,
      inicioMin: c.inicio_min,
      duracion: c.duracion,
      temaTitulo: c.tema_id
        ? (temasById.get(c.tema_id) ?? "Clase grupal")
        : "Clase grupal",
      estadoPedido:
        est === "PENDIENTE"
          ? "PENDIENTE"
          : est === "RECHAZADA"
            ? "RECHAZADA"
            : null,
    };
  });
}

/** Una clase del propio alumno ese día que se pise con la franja dada.
 *  Sirve para no dejarlo anotarse en dos clases a la misma hora. */
async function claseDelAlumnoQueSePisa(
  s: any,
  alumnoId: string,
  fecha: string,
  inicioMin: number,
  duracion: number,
): Promise<{ inicioMin: number; duracion: number } | null> {
  const { data: links } = await s
    .from("clase_alumnos")
    .select("clase_id")
    .eq("alumno_id", alumnoId);
  const ids = (links ?? []).map((l: any) => l.clase_id);
  if (ids.length === 0) return null;

  const { data: suyas } = await s
    .from("clases")
    .select("inicio_min, duracion")
    .in("id", ids)
    .eq("fecha", fecha);

  for (const c of suyas ?? []) {
    if (solapan(inicioMin, duracion, c.inicio_min, c.duracion))
      return { inicioMin: c.inicio_min, duracion: c.duracion };
  }
  return null;
}

/** El alumno PIDE lugar en una clase grupal. Crea un pedido PENDIENTE que el
 *  admin luego aprueba o rechaza. No lo inscribe todavía. */
export async function pedirUnirseAClase(
  orgId: string,
  alumnoId: string,
  claseId: string,
): Promise<{ ok: boolean; error?: string }> {
  const s = dbDeOrg(orgId);
  if (!s) return { ok: false, error: "No se pudo conectar. Probá más tarde." };

  const { data: clase } = await s
    .from("clases")
    .select("id, tipo, fecha, inicio_min, duracion")
    .eq("id", claseId)
    .maybeSingle();
  if (!clase) return { ok: false, error: "La clase ya no está disponible." };
  if (clase.tipo !== "GRUPAL")
    return { ok: false, error: "Solo se pide lugar en clases grupales." };
  if (clase.fecha < hoyEn(await zonaDe(orgId)))
    return { ok: false, error: "Esa clase ya pasó." };

  // Si ya está inscripto o ya pidió, no duplico (idempotente).
  const { data: ya } = await s
    .from("clase_alumnos")
    .select("clase_id")
    .eq("clase_id", claseId)
    .eq("alumno_id", alumnoId)
    .maybeSingle();
  if (ya) return { ok: true };

  // Que no se anote en dos clases a la misma hora (una clase suya de ese día
  // que se pise con esta). Ojo: acá SÍ se filtra por alumno, porque el choque
  // es "no puede estar en dos lugares a la vez", no "el profe está ocupado".
  const propia = await claseDelAlumnoQueSePisa(
    s,
    alumnoId,
    clase.fecha,
    clase.inicio_min,
    clase.duracion,
  );
  if (propia)
    return {
      ok: false,
      error: `Ya tenés una clase ese día de ${hhmm(propia.inicioMin)} a ${hhmm(propia.inicioMin + propia.duracion)}. No podés estar en las dos a la vez.`,
    };

  const { data: pedidoPrevio } = await s
    .from("solicitudes_union")
    .select("id")
    .eq("clase_id", claseId)
    .eq("alumno_id", alumnoId)
    .maybeSingle();
  if (pedidoPrevio) return { ok: true };

  await s.from("solicitudes_union").insert({
    id: `su-${Date.now()}`,
    clase_id: claseId,
    alumno_id: alumnoId,
    estado: "PENDIENTE",
  });

  const nombre = await nombreDeAlumno(s, alumnoId);
  await notificarAdmins(orgId, {
    titulo: "Piden lugar en una grupal",
    cuerpo: `${nombre} quiere sumarse a la grupal del ${nombreDiaLargo(clase.fecha)} ${ddmm(clase.fecha)} a las ${hhmm(clase.inicio_min)}. Hay que aprobarlo o rechazarlo.`,
    url: "/panel/pedidos",
  });
  return { ok: true };
}

/** Crea una clase pedida por el alumno: SIN profe ni tema (los asigna el admin).
 *  El alumno queda inscripto y con la seña pendiente. */
export async function crearClaseDeAlumno(
  orgId: string,
  alumnoId: string,
  d: {
    tipo: "GRUPAL" | "INDIVIDUAL";
    fecha: string;
    inicioMin: number;
    duracion: number;
  },
): Promise<{ ok: boolean; error?: string }> {
  const s = dbDeOrg(orgId);
  if (!s) return { ok: false, error: "No se pudo conectar. Probá más tarde." };

  // Último control antes de escribir: que nadie haya tomado ese horario
  // mientras el alumno completaba el formulario (dos personas agendando a la
  // vez). La pantalla ya no ofrece los ocupados, pero esto es lo que de verdad
  // impide que se pisen dos clases.
  const choque = await buscarChoque(orgId, d.fecha, d.inicioMin, d.duracion);
  if (choque) {
    return {
      ok: false,
      error: `Justo tomaron ese horario (ya hay una clase de ${hhmm(choque.inicioMin)} a ${hhmm(choque.inicioMin + choque.duracion)}). Elegí otro.`,
    };
  }

  const id = `c-${Date.now()}`;
  const { error } = await s.from("clases").insert({
    id,
    tipo: d.tipo,
    tema_id: null,
    fecha: d.fecha,
    inicio_min: d.inicioMin,
    duracion: d.duracion,
    profe_id: null,
  });
  if (error) return { ok: false, error: "No se pudo agendar. Probá de nuevo." };

  await s.from("clase_alumnos").insert({ clase_id: id, alumno_id: alumnoId });
  await s.from("pagos").insert({
    id: `p-${Date.now()}`,
    clase_id: id,
    alumno_id: alumnoId,
    estado: "SIN_PAGAR",
  });
  await avisarProfeDeCambio(orgId, d.fecha, null);

  const nombre = await nombreDeAlumno(s, alumnoId);
  await notificarAdmins(orgId, {
    titulo: "Nueva clase agendada",
    cuerpo: `${nombre} pidió una clase ${d.tipo === "GRUPAL" ? "grupal" : "individual"} para el ${nombreDiaLargo(d.fecha)} ${ddmm(d.fecha)} a las ${hhmm(d.inicioMin)}. Falta asignarle profe y tema.`,
    url: "/panel/agenda",
  });
  return { ok: true };
}

export interface PreciosPortal {
  valorIndividual: number;
  valorGrupal2: number;
  valorGrupal3: number;
  valorSena: number;
}

/** Precios públicos para mostrarle al alumno (lee con service key porque el
 *  alumno no está autenticado en Supabase). */
export async function getPreciosPortal(orgId: string): Promise<PreciosPortal> {
  const vacio = {
    valorIndividual: 0,
    valorGrupal2: 0,
    valorGrupal3: 0,
    valorSena: 0,
  };
  const s = dbDeOrg(orgId);
  if (!s) return vacio;
  const { data } = await s
    .from("precios")
    .select("*")
    .maybeSingle();
  if (!data) return vacio;
  return {
    valorIndividual: Number(data.valor_individual ?? 0),
    valorGrupal2: Number(data.valor_grupal_2 ?? 0),
    valorGrupal3: Number(data.valor_grupal_3 ?? 0),
    valorSena: Number(data.valor_sena ?? 0),
  };
}
