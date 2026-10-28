import "server-only";
import { createClient } from "./supabase/server";
import { hoyEn, sumarMes, parseFecha, ZONA_ARGENTINA } from "./fechas";
import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { dbDeOrg } from "./supabase/org";
import { getCurrentUser } from "./auth";
import { TAGS, VENCIMIENTO, AHORA, etiquetaDeOrg } from "./cache-tags";
import { precioAlumno } from "./precios";

/**
 * Los avisos (push y WhatsApp) se cargan solo cuando hay que mandar uno.
 *
 * Este archivo lo importa cada pantalla del panel, y los avisos arrastran
 * web-push y el modulo de WhatsApp. Con el import arriba, esas librerias se
 * cargaban al levantar la funcion incluso para mostrar una lista de alumnos, y
 * eso se paga en el arranque en frio (medido: 1,14 s la primera visita contra
 * 250 ms las siguientes). Mismo criterio que en lib/bot/uso.ts.
 */
const avisarProfeDeCambio: typeof import("./bot/avisos-profe").avisarProfeDeCambio =
  async (...args) => (await import("./bot/avisos-profe")).avisarProfeDeCambio(...args);
const notificarAdmins: typeof import("./push").notificarAdmins = async (...args) =>
  (await import("./push")).notificarAdmins(...args);
import type {
  Usuario,
  Alumno,
  Tema,
  Clase,
  Pago,
  Tarifa,
  Solicitud,
  ReporteClase,
  Seguimiento,
  EstadoPago,
} from "./types";
import { montoTexto } from "./utils";
import { getOrganizacion, monedaDe, zonaDe } from "./organizacion";

// ============================================================
// Capa de datos sobre Supabase (Postgres). Reemplaza al mock.
// Las funciones son async: en los componentes/acciones se usan con await.
// (El nombre del archivo quedó por compatibilidad de imports.)
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapUsuario(r: any): Usuario {
  return {
    id: r.id,
    nombre: r.nombre ?? "",
    email: r.email ?? "",
    rol: r.rol,
    esProfe: r.es_profe ?? false,
    telefono: r.telefono ?? undefined,
    activo: r.activo,
    creadoEn: r.creado_en,
  };
}
function mapAlumno(r: any): Alumno {
  return {
    id: r.id,
    nombre: r.nombre,
    carrera: r.carrera ?? "",
    zonaHoraria: r.zona_horaria || undefined,
    email: r.email ?? undefined,
    telefono: r.telefono ?? undefined,
    notas: r.notas ?? undefined,
    codigoAcceso: r.codigo_acceso ?? undefined,
    creadoEn: r.creado_en,
  };
}
function mapTema(r: any): Tema {
  return {
    id: r.id,
    titulo: r.titulo,
    descripcion: r.descripcion ?? "",
    contenido: r.contenido ?? "",
    recursos: Array.isArray(r.recursos) ? r.recursos : [],
    creadoEn: r.creado_en,
    actualizadoEn: r.actualizado_en,
  };
}
function mapClase(r: any): Clase {
  return {
    id: r.id,
    tipo: r.tipo,
    temaId: r.tema_id ?? "",
    fecha: r.fecha,
    inicioMin: r.inicio_min,
    duracion: r.duracion,
    profeId: r.profe_id ?? "",
    alumnoIds: (r.clase_alumnos ?? []).map((x: any) => x.alumno_id),
    notas: r.notas ?? undefined,
    estadoRealizacion: r.estado_realizacion ?? "PENDIENTE",
  };
}
function mapPago(r: any): Pago {
  return {
    id: r.id,
    claseId: r.clase_id,
    alumnoId: r.alumno_id,
    estado: r.estado,
    monto: r.monto ?? undefined,
    fecha: r.fecha ?? undefined,
  };
}
function mapTarifa(r: any): Tarifa {
  return {
    id: r.id,
    profeId: r.profe_id,
    valorGrupal: Number(r.valor_grupal),
    valorIndividual: Number(r.valor_individual),
    // Defensivo: si todavía no se corrió el SQL de estas columnas, se usan los
    // valores acordados con la academia (individual 2500, grupal 4000).
    valorCanceladaIndividual: Number(r.valor_cancelada_individual ?? 2500),
    valorCanceladaGrupal: Number(r.valor_cancelada_grupal ?? 4000),
    vigenteDesde: r.vigente_desde,
  };
}
function mapReporte(r: any): ReporteClase {
  return {
    id: r.id,
    claseId: r.clase_id,
    metodo: r.metodo ?? "",
    temaDado: r.tema_dado ?? "",
    observaciones: r.observaciones ?? "",
    porAlumno: Array.isArray(r.por_alumno) ? r.por_alumno : [],
    creadoEn: r.creado_en,
  };
}
function mapSolicitud(r: any): Solicitud {
  return {
    id: r.id,
    nombre: r.nombre,
    contacto: r.contacto,
    carrera: r.carrera ?? "",
    temaInteres: r.tema_interes ?? "",
    preferencia: r.preferencia,
    mensaje: r.mensaje ?? undefined,
    estado: r.estado,
    creadoEn: r.creado_en,
  };
}

const CLASE_SELECT = "*, clase_alumnos(alumno_id)";

// ---------------- Usuarios / perfiles ----------------
/** Academia del usuario logueado (memorizada por render en getCurrentUser).
 *  null sin sesión: entonces no hay caché, y las reglas de la base deciden. */
async function orgDeLaSesion(): Promise<string | null> {
  return (await getCurrentUser())?.organizacionId ?? null;
}

/** La zona horaria de la academia del usuario logueado (sin sesión, la de
 *  Argentina: no debería pasar en estas funciones del panel). */
async function zonaDeLaSesion(): Promise<string> {
  const orgId = await orgDeLaSesion();
  return orgId ? zonaDe(orgId) : ZONA_ARGENTINA;
}

/** Invalida una caché de la academia del usuario logueado. */
async function invalidar(etiqueta: string): Promise<void> {
  const orgId = await orgDeLaSesion();
  if (orgId) revalidateTag(etiquetaDeOrg(etiqueta, orgId), AHORA);
}

/**
 * Los perfiles del equipo de una academia. Son pocas filas que casi nunca
 * cambian y las lee cada pantalla, así que van cacheadas.
 *
 * Con el cliente admin, porque una función cacheada no puede leer cookies; por
 * eso la organización va explícita, en la clave y en la etiqueta de la caché.
 */
function usuariosCacheados(orgId: string): Promise<Usuario[]> {
  return unstable_cache(
    async (): Promise<Usuario[]> => {
      const db = dbDeOrg(orgId);
      if (!db) throw new Error("sin cliente admin");
      const { data, error } = await db
        .from("profiles")
        .select("*")
        .order("creado_en");
      // Importante que TIRE el error en vez de devolver vacío: unstable_cache
      // guarda lo que devuelva la función, así que un vacío por falla quedaría
      // cacheado cinco minutos. Si tira, no se cachea nada.
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapUsuario);
    },
    ["usuarios", orgId],
    { tags: [etiquetaDeOrg(TAGS.equipo, orgId)], revalidate: VENCIMIENTO },
  )();
}

export async function getUsuarios(): Promise<Usuario[]> {
  const orgId = await orgDeLaSesion();
  if (orgId) {
    try {
      return await usuariosCacheados(orgId);
    } catch {
      // Falló la lectura cacheada: se lee derecho, sin caché, para que la
      // pantalla funcione igual y la falla no quede guardada.
    }
  }
  const s = await createClient();
  const { data } = await s.from("profiles").select("*").order("creado_en");
  return (data ?? []).map(mapUsuario);
}
export const getUserById = cache(
  async (id: string): Promise<Usuario | undefined> => {
    const s = await createClient();
    const { data } = await s.from("profiles").select("*").eq("id", id).maybeSingle();
    return data ? mapUsuario(data) : undefined;
  },
);
export async function getProfes(): Promise<Usuario[]> {
  // Sale de getUsuarios, que ya está cacheado: así no se hace una segunda
  // consulta a la misma tabla. Profes "de rol" + admins marcados como docentes
  // (es_profe); se filtra en JS para no romper si esa columna todavía no
  // existe en la base.
  const todos = await getUsuarios();
  return todos
    .filter((u) => u.rol === "PROFE" || u.esProfe === true)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}
export async function setUsuarioActivo(id: string, activo: boolean): Promise<void> {
  const s = await createClient();
  await s.from("profiles").update({ activo }).eq("id", id);
  await invalidar(TAGS.equipo);
}
export async function setTelefonoUsuario(
  id: string,
  telefono: string,
): Promise<void> {
  const s = await createClient();
  await s.from("profiles").update({ telefono: telefono || null }).eq("id", id);
  await invalidar(TAGS.equipo);
}

// ---------------- Alumnos ----------------
export async function getAlumnos(): Promise<Alumno[]> {
  const s = await createClient();
  const { data } = await s.from("alumnos").select("*").order("nombre");
  return (data ?? []).map(mapAlumno);
}
export const getAlumnoById = cache(
  async (id: string): Promise<Alumno | undefined> => {
    const s = await createClient();
    const { data } = await s.from("alumnos").select("*").eq("id", id).maybeSingle();
    return data ? mapAlumno(data) : undefined;
  },
);
type DatosAlumno = {
  nombre: string;
  carrera: string;
  email?: string;
  telefono?: string;
  zonaHoraria?: string;
  notas?: string;
};
export async function crearAlumno(d: DatosAlumno): Promise<Alumno> {
  const s = await createClient();
  const { data } = await s
    .from("alumnos")
    .insert({
      id: `a-${Date.now()}`,
      nombre: d.nombre,
      carrera: d.carrera,
      email: d.email ?? null,
      telefono: d.telefono ?? null,
      ...(d.zonaHoraria ? { zona_horaria: d.zonaHoraria } : {}),
      notas: d.notas ?? null,
    })
    .select()
    .single();
  return mapAlumno(data);
}
export async function actualizarAlumno(
  id: string,
  d: DatosAlumno,
): Promise<Alumno | undefined> {
  const s = await createClient();
  const { data } = await s
    .from("alumnos")
    .update({
      nombre: d.nombre,
      carrera: d.carrera,
      email: d.email ?? null,
      telefono: d.telefono ?? null,
      // Se escribe siempre, incluso vacío: si no, elegir "Argentina" en un
      // alumno que tenía otra zona no la borraría nunca.
      zona_horaria: d.zonaHoraria ?? "",
      notas: d.notas ?? null,
    })
    .eq("id", id)
    .select()
    .maybeSingle();
  return data ? mapAlumno(data) : undefined;
}
export async function eliminarAlumno(id: string): Promise<boolean> {
  const s = await createClient();
  const { error } = await s.from("alumnos").delete().eq("id", id);
  return !error;
}

// ---------------- Temas ----------------
/** Los temas del temario de una academia: cambian poco y los lee casi toda
 *  pantalla. Mismo criterio de caché que usuariosCacheados. */
function temasCacheados(orgId: string): Promise<Tema[]> {
  return unstable_cache(
    async (): Promise<Tema[]> => {
      const db = dbDeOrg(orgId);
      if (!db) throw new Error("sin cliente admin");
      const { data, error } = await db
        .from("temas")
        .select("*")
        .order("actualizado_en", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapTema);
    },
    ["temas", orgId],
    { tags: [etiquetaDeOrg(TAGS.temas, orgId)], revalidate: VENCIMIENTO },
  )();
}

export async function getTemas(): Promise<Tema[]> {
  const orgId = await orgDeLaSesion();
  if (orgId) {
    try {
      return await temasCacheados(orgId);
    } catch {
      // Sin caché si falla, como en getUsuarios.
    }
  }
  const s = await createClient();
  const { data } = await s
    .from("temas")
    .select("*")
    .order("actualizado_en", { ascending: false });
  return (data ?? []).map(mapTema);
}
export const getTemaById = cache(
  async (id: string): Promise<Tema | undefined> => {
    const s = await createClient();
    const { data } = await s.from("temas").select("*").eq("id", id).maybeSingle();
    return data ? mapTema(data) : undefined;
  },
);
type DatosTema = {
  titulo: string;
  descripcion: string;
  contenido: string;
  recursos: Tema["recursos"];
};
export async function crearTema(d: DatosTema): Promise<Tema> {
  const s = await createClient();
  const { data } = await s
    .from("temas")
    .insert({
      id: `t-${Date.now()}`,
      titulo: d.titulo,
      descripcion: d.descripcion,
      contenido: d.contenido,
      recursos: d.recursos,
    })
    .select()
    .single();
  await invalidar(TAGS.temas);
  return mapTema(data);
}
export async function actualizarTema(
  id: string,
  d: DatosTema,
): Promise<Tema | undefined> {
  const s = await createClient();
  const { data } = await s
    .from("temas")
    .update({
      titulo: d.titulo,
      descripcion: d.descripcion,
      contenido: d.contenido,
      recursos: d.recursos,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .maybeSingle();
  await invalidar(TAGS.temas);
  return data ? mapTema(data) : undefined;
}
export async function eliminarTema(id: string): Promise<boolean> {
  const s = await createClient();
  const { error } = await s.from("temas").delete().eq("id", id);
  await invalidar(TAGS.temas);
  return !error;
}

// ---------------- Clases ----------------
export async function getClases(): Promise<Clase[]> {
  const s = await createClient();
  const { data } = await s.from("clases").select(CLASE_SELECT).order("fecha").order("inicio_min");
  return (data ?? []).map(mapClase);
}
export async function getClaseById(id: string): Promise<Clase | undefined> {
  const s = await createClient();
  const { data } = await s.from("clases").select(CLASE_SELECT).eq("id", id).maybeSingle();
  return data ? mapClase(data) : undefined;
}
export async function getClasesDeProfe(profeId: string): Promise<Clase[]> {
  const s = await createClient();
  const { data } = await s.from("clases").select(CLASE_SELECT).eq("profe_id", profeId);
  return (data ?? []).map(mapClase);
}
export async function getProximasClases(
  limit?: number,
  profeId?: string,
): Promise<Clase[]> {
  const s = await createClient();
  let q = s
    .from("clases")
    .select(CLASE_SELECT)
    .gte("fecha", hoyEn(await zonaDeLaSesion()))
    .order("fecha")
    .order("inicio_min");
  if (profeId) q = q.eq("profe_id", profeId);
  if (typeof limit === "number") q = q.limit(limit);
  const { data } = await q;
  return (data ?? []).map(mapClase);
}
export async function getClasesDeProfeEnFecha(
  profeId: string,
  fecha: string,
): Promise<Clase[]> {
  const s = await createClient();
  const { data } = await s
    .from("clases")
    .select(CLASE_SELECT)
    .eq("profe_id", profeId)
    .eq("fecha", fecha);
  return (data ?? []).map(mapClase);
}
export async function getClasesDeAlumno(alumnoId: string): Promise<Clase[]> {
  const s = await createClient();
  const { data: links } = await s
    .from("clase_alumnos")
    .select("clase_id")
    .eq("alumno_id", alumnoId);
  const ids = (links ?? []).map((l: any) => l.clase_id);
  if (ids.length === 0) return [];
  const { data } = await s
    .from("clases")
    .select(CLASE_SELECT)
    .in("id", ids)
    .order("fecha", { ascending: false });
  return (data ?? []).map(mapClase);
}
/** Las clases entre dos fechas, inclusive. La agenda pide solo lo que se ve. */
export async function getClasesEntre(desde: string, hasta: string): Promise<Clase[]> {
  const s = await createClient();
  const { data } = await s
    .from("clases")
    .select(CLASE_SELECT)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha")
    .order("inicio_min");
  return (data ?? []).map(mapClase);
}
export async function getClasesEnMes(anioMes: string): Promise<Clase[]> {
  const s = await createClient();
  const desde = `${anioMes}-01`;
  const hasta = `${sumarMes(anioMes, 1)}-01`;
  const { data } = await s
    .from("clases")
    .select(CLASE_SELECT)
    .gte("fecha", desde)
    .lt("fecha", hasta);
  return (data ?? []).map(mapClase);
}
export async function crearClase(orgId: string, d: {
  tipo: Clase["tipo"];
  temaId: string;
  fecha: string;
  inicioMin: number;
  duracion: Clase["duracion"];
  profeId: string;
  alumnoIds: string[];
  notas?: string;
}): Promise<Clase> {
  const s = await createClient();
  const id = `c-${Date.now()}`;
  await s.from("clases").insert({
    id,
    tipo: d.tipo,
    tema_id: d.temaId,
    fecha: d.fecha,
    inicio_min: d.inicioMin,
    duracion: d.duracion,
    profe_id: d.profeId,
    notas: d.notas ?? null,
  });
  if (d.alumnoIds.length > 0) {
    await s
      .from("clase_alumnos")
      .insert(d.alumnoIds.map((aid) => ({ clase_id: id, alumno_id: aid })));
    await s.from("pagos").insert(
      d.alumnoIds.map((aid, i) => ({
        id: `p-${Date.now()}-${i}`,
        clase_id: id,
        alumno_id: aid,
        estado: "SIN_PAGAR",
      })),
    );
  }
  await avisarProfeDeCambio(orgId, d.fecha, d.profeId || null);
  return { id, ...d, estadoRealizacion: "PENDIENTE" as const };
}
export async function actualizarClase(
  orgId: string,
  id: string,
  d: {
    tipo: Clase["tipo"];
    temaId: string;
    fecha: string;
    inicioMin: number;
    duracion: Clase["duracion"];
    profeId: string;
  },
): Promise<Clase | undefined> {
  const s = await createClient();
  const { data } = await s
    .from("clases")
    .update({
      tipo: d.tipo,
      tema_id: d.temaId || null,
      fecha: d.fecha,
      inicio_min: d.inicioMin,
      duracion: d.duracion,
      profe_id: d.profeId || null,
    })
    .eq("id", id)
    .select(CLASE_SELECT)
    .maybeSingle();
  if (data) await avisarProfeDeCambio(orgId, d.fecha, d.profeId || null);
  return data ? mapClase(data) : undefined;
}
/** Un alumno que se saca de la clase y ya tenía plata registrada. */
export interface AlumnoConPago {
  alumnoId: string;
  nombre: string;
  estado: EstadoPago;
  monto: number;
}

export interface CambioAlumnos {
  agregados: string[];
  quitados: string[];
  /** De los que se quitan, los que ya habían señado o pagado. Sacarlos borra
   *  ese registro de plata, así que la UI pide confirmación antes. */
  quitadosConPago: AlumnoConPago[];
}

/** Diferencia entre los alumnos que tiene la clase y los que se quieren dejar.
 *  NO escribe nada: sirve para avisar antes de borrar un pago. */
export async function simularCambioAlumnos(
  claseId: string,
  alumnoIds: string[],
): Promise<CambioAlumnos> {
  const s = await createClient();
  const { data: actualesRaw } = await s
    .from("clase_alumnos")
    .select("alumno_id")
    .eq("clase_id", claseId);
  const actuales = (actualesRaw ?? []).map((r: any) => r.alumno_id as string);

  const agregados = alumnoIds.filter((id) => !actuales.includes(id));
  const quitados = actuales.filter((id) => !alumnoIds.includes(id));

  const quitadosConPago: AlumnoConPago[] = [];
  if (quitados.length > 0) {
    const { data: pagos } = await s
      .from("pagos")
      .select("alumno_id, estado, monto")
      .eq("clase_id", claseId)
      .in("alumno_id", quitados);
    for (const p of pagos ?? []) {
      if (p.estado === "SIN_PAGAR") continue;
      const alumno = await getAlumnoById(p.alumno_id);
      quitadosConPago.push({
        alumnoId: p.alumno_id,
        nombre: alumno?.nombre ?? "Alumno",
        estado: p.estado as EstadoPago,
        monto: Number(p.monto ?? 0),
      });
    }
  }
  return { agregados, quitados, quitadosConPago };
}

/**
 * Deja la clase con EXACTAMENTE esos alumnos.
 *
 * A los que entran se les crea el pago pendiente; a los que salen se les borra
 * la inscripción y el pago. Al final recotiza, porque el precio por alumno
 * cambia según cuántos queden (2 vs 3 o más).
 */
export async function setAlumnosDeClase(
  orgId: string,
  claseId: string,
  alumnoIds: string[],
): Promise<CambioAlumnos> {
  const s = await createClient();
  const cambio = await simularCambioAlumnos(claseId, alumnoIds);

  if (cambio.quitados.length > 0) {
    await s
      .from("pagos")
      .delete()
      .eq("clase_id", claseId)
      .in("alumno_id", cambio.quitados);
    await s
      .from("clase_alumnos")
      .delete()
      .eq("clase_id", claseId)
      .in("alumno_id", cambio.quitados);
  }

  if (cambio.agregados.length > 0) {
    await s
      .from("clase_alumnos")
      .insert(
        cambio.agregados.map((aid) => ({ clase_id: claseId, alumno_id: aid })),
      );
    await s.from("pagos").insert(
      cambio.agregados.map((aid, i) => ({
        id: `p-${Date.now()}-${i}`,
        clase_id: claseId,
        alumno_id: aid,
        estado: "SIN_PAGAR",
      })),
    );
  }

  // Cambió cuántos son → cambia el precio por alumno de los que ya pagaron.
  if (cambio.agregados.length > 0 || cambio.quitados.length > 0) {
    await recotizarClase(orgId, claseId);
  }
  return cambio;
}

export async function eliminarClase(orgId: string, id: string): Promise<boolean> {
  const s = await createClient();
  // Guardamos fecha y profe ANTES de borrar: después de la baja ya no hay de
  // dónde sacarlos, y el profe tiene que enterarse de que se cayó una clase.
  const { data: previa } = await s
    .from("clases")
    .select("fecha, profe_id")
    .eq("id", id)
    .maybeSingle();
  const { error } = await s.from("clases").delete().eq("id", id);
  if (error) return false;
  if (previa?.fecha) {
    await avisarProfeDeCambio(orgId, previa.fecha, previa.profe_id ?? null);
  }
  return true;
}
export async function setEstadoRealizacion(
  claseId: string,
  estado: Clase["estadoRealizacion"],
): Promise<void> {
  const s = await createClient();
  await s
    .from("clases")
    .update({ estado_realizacion: estado })
    .eq("id", claseId);
}

// ---------------- Pagos ----------------
export async function getPagos(): Promise<Pago[]> {
  const s = await createClient();
  const { data } = await s.from("pagos").select("*");
  return (data ?? []).map(mapPago);
}
export async function getPagosDeClase(claseId: string): Promise<Pago[]> {
  const s = await createClient();
  const { data } = await s.from("pagos").select("*").eq("clase_id", claseId);
  return (data ?? []).map(mapPago);
}
export async function getPagoDe(
  claseId: string,
  alumnoId: string,
): Promise<Pago | undefined> {
  const s = await createClient();
  const { data } = await s
    .from("pagos")
    .select("*")
    .eq("clase_id", claseId)
    .eq("alumno_id", alumnoId)
    .maybeSingle();
  return data ? mapPago(data) : undefined;
}
export async function setEstadoPago(
  claseId: string,
  alumnoId: string,
  estado: Pago["estado"],
  monto?: number,
): Promise<void> {
  const s = await createClient();
  const { data: existente } = await s
    .from("pagos")
    .select("*")
    .eq("clase_id", claseId)
    .eq("alumno_id", alumnoId)
    .maybeSingle();
  const montoVal =
    estado === "SIN_PAGAR" ? null : (monto ?? existente?.monto ?? null);
  const fechaVal =
    estado === "SIN_PAGAR" ? null : (existente?.fecha ?? hoyEn(await zonaDeLaSesion()));
  if (existente) {
    await s
      .from("pagos")
      .update({ estado, monto: montoVal, fecha: fechaVal })
      .eq("id", existente.id);
  } else {
    await s.from("pagos").insert({
      id: `p-${Date.now()}`,
      clase_id: claseId,
      alumno_id: alumnoId,
      estado,
      monto: montoVal,
      fecha: fechaVal,
    });
  }
}

// ---------------- Tarifas ----------------
export async function getTarifas(): Promise<Tarifa[]> {
  const s = await createClient();
  const { data } = await s.from("tarifas").select("*");
  return (data ?? []).map(mapTarifa);
}
export async function getTarifaDeProfe(
  profeId: string,
): Promise<Tarifa | undefined> {
  const s = await createClient();
  const { data } = await s
    .from("tarifas")
    .select("*")
    .eq("profe_id", profeId)
    .maybeSingle();
  return data ? mapTarifa(data) : undefined;
}
export async function setTarifa(
  profeId: string,
  valorGrupal: number,
  valorIndividual: number,
  valorCanceladaIndividual: number,
  valorCanceladaGrupal: number,
): Promise<void> {
  const s = await createClient();
  const base = {
    valor_grupal: valorGrupal,
    valor_individual: valorIndividual,
  };
  const conCancelada = {
    ...base,
    valor_cancelada_individual: valorCanceladaIndividual,
    valor_cancelada_grupal: valorCanceladaGrupal,
  };

  const { data: existente } = await s
    .from("tarifas")
    .select("id")
    .eq("profe_id", profeId)
    .maybeSingle();

  // Si todavía no se corrió el SQL de las columnas de "clase caída", el guardado
  // fallaría entero y no se podría ni tocar la tarifa normal. Por eso, si falla,
  // se reintenta guardando solo lo de siempre.
  const guardar = async (fila: Record<string, unknown>) => {
    if (existente) {
      return s
        .from("tarifas")
        .update({ ...fila, vigente_desde: hoyEn(await zonaDeLaSesion()) })
        .eq("id", existente.id);
    }
    return s
      .from("tarifas")
      .insert({ id: `tar-${Date.now()}`, profe_id: profeId, ...fila });
  };

  const { error } = await guardar(conCancelada);
  if (error) {
    console.error("[tarifas] guardando sin las columnas de clase caída:", error.message);
    await guardar(base);
  }
}

// ---------------- Reportes ----------------
export async function getReporteDeClase(
  claseId: string,
): Promise<ReporteClase | undefined> {
  const s = await createClient();
  const { data } = await s.from("reportes").select("*").eq("clase_id", claseId).maybeSingle();
  return data ? mapReporte(data) : undefined;
}
export async function getReportesDeAlumno(
  alumnoId: string,
): Promise<ReporteClase[]> {
  const s = await createClient();
  // Reportes de las clases en las que está el alumno (sin consultas jsonb frágiles)
  const { data: links } = await s
    .from("clase_alumnos")
    .select("clase_id")
    .eq("alumno_id", alumnoId);
  const claseIds = (links ?? []).map((l: { clase_id: string }) => l.clase_id);
  if (claseIds.length === 0) return [];
  const { data } = await s
    .from("reportes")
    .select("*")
    .in("clase_id", claseIds)
    .order("creado_en", { ascending: false });
  return (data ?? [])
    .map(mapReporte)
    .filter((r) => r.porAlumno.some((pa) => pa.alumnoId === alumnoId));
}
export async function guardarReporte(
  claseId: string,
  d: {
    metodo: string;
    temaDado: string;
    observaciones: string;
    porAlumno: ReporteClase["porAlumno"];
  },
): Promise<ReporteClase> {
  const s = await createClient();
  const { data: existente } = await s
    .from("reportes")
    .select("id")
    .eq("clase_id", claseId)
    .maybeSingle();
  const fila = {
    clase_id: claseId,
    metodo: d.metodo,
    tema_dado: d.temaDado,
    observaciones: d.observaciones,
    por_alumno: d.porAlumno,
  };
  if (existente) {
    const { data } = await s
      .from("reportes")
      .update(fila)
      .eq("id", existente.id)
      .select()
      .single();
    return mapReporte(data);
  }
  const { data } = await s
    .from("reportes")
    .insert({ id: `rep-${Date.now()}`, ...fila })
    .select()
    .single();
  return mapReporte(data);
}

// ---------------- Ficha evolutiva (seguimientos) ----------------
function mapSeguimiento(r: any): Seguimiento {
  return {
    id: r.id,
    alumnoId: r.alumno_id,
    fecha: r.fecha,
    tema: r.tema ?? "",
    desempeno: r.desempeno ?? "",
    aReforzar: r.a_reforzar ?? "",
    autorId: r.autor_id ?? undefined,
    autorNombre: r.autor_nombre ?? "",
    creadoEn: r.creado_en,
    actualizadoEn: r.actualizado_en,
  };
}
export async function getSeguimientosDeAlumno(
  alumnoId: string,
): Promise<Seguimiento[]> {
  const s = await createClient();
  const { data } = await s
    .from("seguimientos")
    .select("*")
    .eq("alumno_id", alumnoId)
    .order("fecha", { ascending: false });
  return (data ?? []).map(mapSeguimiento);
}
export async function getSeguimientoById(
  id: string,
): Promise<Seguimiento | undefined> {
  const s = await createClient();
  const { data } = await s
    .from("seguimientos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ? mapSeguimiento(data) : undefined;
}
type DatosSeguimiento = {
  alumnoId: string;
  fecha: string;
  tema: string;
  desempeno: string;
  aReforzar: string;
  autorId?: string;
  autorNombre: string;
};
export async function crearSeguimiento(
  d: DatosSeguimiento,
): Promise<Seguimiento | undefined> {
  const s = await createClient();
  const { data } = await s
    .from("seguimientos")
    .insert({
      id: `seg-${Date.now()}`,
      alumno_id: d.alumnoId,
      fecha: d.fecha,
      tema: d.tema,
      desempeno: d.desempeno,
      a_reforzar: d.aReforzar,
      autor_id: d.autorId ?? null,
      autor_nombre: d.autorNombre,
    })
    .select()
    .maybeSingle();
  return data ? mapSeguimiento(data) : undefined;
}
export async function actualizarSeguimiento(
  id: string,
  d: { fecha: string; tema: string; desempeno: string; aReforzar: string },
): Promise<Seguimiento | undefined> {
  const s = await createClient();
  const { data } = await s
    .from("seguimientos")
    .update({
      fecha: d.fecha,
      tema: d.tema,
      desempeno: d.desempeno,
      a_reforzar: d.aReforzar,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .maybeSingle();
  return data ? mapSeguimiento(data) : undefined;
}
export async function eliminarSeguimiento(id: string): Promise<boolean> {
  const s = await createClient();
  const { error } = await s.from("seguimientos").delete().eq("id", id);
  return !error;
}

// ---------------- Cobros pendientes (plata de clases YA DADAS) ----------------

/** Una clase ya dictada por la que todavía falta cobrar plata. */
export interface CobroPendiente {
  claseId: string;
  alumnoId: string;
  alumnoNombre: string;
  fecha: string;
  temaTitulo: string;
  tipo: Clase["tipo"];
  duracion: number;
  /** Precio total que corresponde a esa clase para ese alumno. */
  precioTotal: number;
  /** Lo que ya entregó (la seña, normalmente). */
  yaPago: number;
  /** Lo que falta cobrar. */
  falta: number;
  /** Días que pasaron desde la clase (para ordenar por antigüedad). */
  diasDesde: number;
}

/**
 * Plata pendiente de clases que YA SE DIERON.
 *
 * Es distinto del filtro "Señaron" de Cobros: ahí se mezclan las clases futuras
 * (donde estar señada es lo NORMAL) con las pasadas (donde señada significa que
 * falta cobrar el resto). Acá solo entran las que ya pasaron, que son las que
 * realmente hay que perseguir.
 *
 * No se cuentan las clases canceladas ni reagendadas: esas no se cobran.
 */
export async function getCobrosPendientes(): Promise<CobroPendiente[]> {
  const s = await createClient();
  const hoy = hoyEn(await zonaDeLaSesion());

  const [{ data: clasesRaw }, precios] = await Promise.all([
    s.from("clases").select(CLASE_SELECT).lt("fecha", hoy).order("fecha"),
    getPrecios(),
  ]);
  const clases = (clasesRaw ?? []).map(mapClase);
  if (clases.length === 0) return [];

  // Solo se le cobra al alumno la clase que SE DIO (o la que todavía no se
  // marcó, que se asume dada). Si canceló a último momento, no avisó o no se
  // conectó, la penalización es perder la seña y no se le reclama nada más
  // (regla de la academia). La reagendada se cobra en su fecha nueva.
  const cobrables = clases.filter(
    (c) =>
      c.estadoRealizacion === "REALIZADA" ||
      c.estadoRealizacion === "PENDIENTE",
  );
  if (cobrables.length === 0) return [];

  const ids = cobrables.map((c) => c.id);
  const [{ data: pagos }, { data: alumnosRaw }, { data: temasRaw }] =
    await Promise.all([
      s.from("pagos").select("clase_id, alumno_id, estado, monto").in("clase_id", ids),
      s.from("alumnos").select("id, nombre"),
      s.from("temas").select("id, titulo"),
    ]);

  const nombreAlumno = new Map<string, string>();
  for (const a of alumnosRaw ?? []) nombreAlumno.set(a.id, a.nombre);
  const tituloTema = new Map<string, string>();
  for (const t of temasRaw ?? []) tituloTema.set(t.id, t.titulo);

  const claseById = new Map(cobrables.map((c) => [c.id, c]));
  const hoyMs = parseFecha(hoy).getTime();
  const pendientes: CobroPendiente[] = [];

  for (const p of pagos ?? []) {
    if (p.estado === "PAGADO") continue;
    const clase = claseById.get(p.clase_id);
    if (!clase) continue;

    const precioTotal = precioAlumno(
      precios,
      clase.tipo,
      clase.alumnoIds.length,
      clase.duracion,
    );
    // La seña ya entregada se descuenta; si está SIN_PAGAR no entregó nada.
    const yaPago = p.estado === "SENADO" ? Number(p.monto ?? 0) : 0;
    const falta = precioTotal - yaPago;
    if (falta <= 0) continue;

    pendientes.push({
      claseId: clase.id,
      alumnoId: p.alumno_id,
      alumnoNombre: nombreAlumno.get(p.alumno_id) ?? "—",
      fecha: clase.fecha,
      temaTitulo: clase.temaId ? (tituloTema.get(clase.temaId) ?? "Clase") : "Clase",
      tipo: clase.tipo,
      duracion: clase.duracion,
      precioTotal,
      yaPago,
      falta,
      diasDesde: Math.round((hoyMs - parseFecha(clase.fecha).getTime()) / 86400000),
    });
  }

  // De la más vieja a la más nueva: lo que más tiempo lleva sin cobrarse primero.
  return pendientes.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Total pendiente de cobro (para mostrar en el panel). */
export async function getTotalPendienteCobro(): Promise<number> {
  const p = await getCobrosPendientes();
  return p.reduce((s, x) => s + x.falta, 0);
}

// ---------------- Precios al alumno (individual / grupal / seña) ----------------
export interface Precios {
  valorIndividual: number;
  /** Grupal de 2 alumnos: precio por alumno. */
  valorGrupal2: number;
  /** Grupal de 3 o más alumnos: precio por alumno. */
  valorGrupal3: number;
  valorSena: number;
}
export async function getPrecios(): Promise<Precios> {
  const s = await createClient();
  const { data } = await s
    .from("precios")
    .select("*")
    .maybeSingle();
  return {
    valorIndividual: Number(data?.valor_individual ?? 0),
    valorGrupal2: Number(data?.valor_grupal_2 ?? 0),
    valorGrupal3: Number(data?.valor_grupal_3 ?? 0),
    valorSena: Number(data?.valor_sena ?? 0),
  };
}
export async function actualizarPrecios(d: Precios): Promise<void> {
  const s = await createClient();
  // Una fila por academia. La organización la completa la base con la del
  // usuario logueado (las reglas de acceso no dejan escribir en otra).
  await s.from("precios").upsert({
    valor_individual: d.valorIndividual,
    valor_grupal_2: d.valorGrupal2,
    valor_grupal_3: d.valorGrupal3,
    valor_sena: d.valorSena,
    actualizado_en: new Date().toISOString(),
  }, { onConflict: "organizacion_id" });
}

// ---------------- Pedidos de unión a clases grupales ----------------
export interface PedidoUnion {
  id: string;
  claseId: string;
  alumnoNombre: string;
  alumnoCarrera: string;
  fecha: string;
  inicioMin: number;
  duracion: number;
  temaTitulo: string;
  creadoEn: string;
}
export async function getPedidosUnionPendientes(): Promise<PedidoUnion[]> {
  const s = await createClient();
  const { data: pedidos } = await s
    .from("solicitudes_union")
    .select("*")
    .eq("estado", "PENDIENTE")
    .order("creado_en");
  if (!pedidos || pedidos.length === 0) return [];

  const claseIds = Array.from(new Set(pedidos.map((p: any) => p.clase_id)));
  const alumnoIds = Array.from(new Set(pedidos.map((p: any) => p.alumno_id)));
  const [{ data: clases }, { data: alumnos }] = await Promise.all([
    s
      .from("clases")
      .select("id, fecha, inicio_min, duracion, tema_id")
      .in("id", claseIds),
    s.from("alumnos").select("id, nombre, carrera").in("id", alumnoIds),
  ]);
  const claseById = new Map((clases ?? []).map((c: any) => [c.id, c]));
  const alumnoById = new Map((alumnos ?? []).map((a: any) => [a.id, a]));

  const temaIds = Array.from(
    new Set((clases ?? []).map((c: any) => c.tema_id).filter(Boolean)),
  );
  const temaById = new Map<string, string>();
  if (temaIds.length > 0) {
    const { data: temas } = await s
      .from("temas")
      .select("id, titulo")
      .in("id", temaIds);
    for (const t of temas ?? []) temaById.set(t.id, t.titulo);
  }

  return pedidos.map((p: any): PedidoUnion => {
    const c = claseById.get(p.clase_id);
    const a = alumnoById.get(p.alumno_id);
    return {
      id: p.id,
      claseId: p.clase_id,
      alumnoNombre: a?.nombre ?? "—",
      alumnoCarrera: a?.carrera ?? "",
      fecha: c?.fecha ?? "",
      inicioMin: c?.inicio_min ?? 0,
      duracion: c?.duracion ?? 0,
      temaTitulo: c?.tema_id
        ? (temaById.get(c.tema_id) ?? "Clase grupal")
        : "Clase grupal",
      creadoEn: p.creado_en,
    };
  });
}
export async function contarPedidosUnionPendientes(): Promise<number> {
  const s = await createClient();
  const { count } = await s
    .from("solicitudes_union")
    .select("id", { count: "exact", head: true })
    .eq("estado", "PENDIENTE");
  return count ?? 0;
}
/** Un pago que cambió de monto porque cambió el tamaño del grupo. */
export interface Recotizacion {
  alumnoNombre: string;
  montoAnterior: number;
  montoNuevo: number;
}

/**
 * Recalcula lo que paga cada alumno de una clase grupal cuando cambia cuántos
 * son (el precio por alumno baja al llegar a 3). Solo toca los pagos ya
 * marcados "Pagó completo": los que están sin pagar se calculan solos al
 * cobrarlos, y la seña es un monto fijo.
 *
 * Devuelve los cambios para poder avisarle a la directora que alguien pagó de
 * más (o de menos) y hay que devolverle/cobrarle la diferencia.
 */
export async function recotizarClase(
  orgId: string,
  claseId: string,
): Promise<Recotizacion[]> {
  const s = await createClient();
  const clase = await getClaseById(claseId);
  if (!clase) return [];

  const [precios, { data: pagos }] = await Promise.all([
    getPrecios(),
    s
      .from("pagos")
      .select("id, alumno_id, estado, monto")
      .eq("clase_id", claseId)
      .eq("estado", "PAGADO"),
  ]);
  if (!pagos || pagos.length === 0) return [];

  const correcto = precioAlumno(
    precios,
    clase.tipo,
    clase.alumnoIds.length,
    clase.duracion,
  );

  const cambios: Recotizacion[] = [];
  for (const p of pagos) {
    const anterior = Number(p.monto ?? 0);
    if (anterior === correcto) continue;
    await s.from("pagos").update({ monto: correcto }).eq("id", p.id);
    const alumno = await getAlumnoById(p.alumno_id);
    cambios.push({
      alumnoNombre: alumno?.nombre ?? "Alumno",
      montoAnterior: anterior,
      montoNuevo: correcto,
    });
  }

  // Cambiar la plata de alguien que YA había pagado no puede pasar en silencio:
  // o hay que devolverle la diferencia, o hay que cobrársela.
  if (cambios.length > 0) {
    const dif = cambios[0].montoAnterior - cambios[0].montoNuevo;
    const quienes = cambios.map((c) => c.alumnoNombre).join(", ");
    const m = monedaDe(await getOrganizacion(orgId));
    await notificarAdmins(orgId, {
      titulo: "Cambió el precio de una clase",
      cuerpo:
        dif > 0
          ? `Al cambiar el grupo, la clase bajó a ${montoTexto(cambios[0].montoNuevo, m)} por alumno. Hay que devolverle ${montoTexto(dif, m)} a ${quienes}.`
          : `Al cambiar el grupo, la clase subió a ${montoTexto(cambios[0].montoNuevo, m)} por alumno. Falta cobrarle ${montoTexto(Math.abs(dif), m)} a ${quienes}.`,
      url: "/panel/finanzas",
    });
  }
  return cambios;
}

export async function aprobarPedidoUnion(orgId: string, id: string): Promise<boolean> {
  const s = await createClient();
  const { data: pedido } = await s
    .from("solicitudes_union")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!pedido) return false;

  // Inscribir al alumno (sin duplicar) y crear su pago pendiente si no existe.
  await s
    .from("clase_alumnos")
    .upsert({ clase_id: pedido.clase_id, alumno_id: pedido.alumno_id });
  const { data: pagoPrevio } = await s
    .from("pagos")
    .select("id")
    .eq("clase_id", pedido.clase_id)
    .eq("alumno_id", pedido.alumno_id)
    .maybeSingle();
  if (!pagoPrevio) {
    await s.from("pagos").insert({
      id: `p-${Date.now()}`,
      clase_id: pedido.clase_id,
      alumno_id: pedido.alumno_id,
      estado: "SIN_PAGAR",
    });
  }
  await s
    .from("solicitudes_union")
    .update({ estado: "APROBADA" })
    .eq("id", id);

  // Al sumarse alguien, el grupo puede pasar a 3 y el precio por alumno baja.
  // recotizarClase reajusta a los que ya habían pagado y avisa por notificación.
  await recotizarClase(orgId, pedido.clase_id);
  return true;
}
export async function rechazarPedidoUnion(id: string): Promise<boolean> {
  const s = await createClient();
  const { error } = await s
    .from("solicitudes_union")
    .update({ estado: "RECHAZADA" })
    .eq("id", id);
  return !error;
}

// ---------------- Solicitudes ----------------
export async function getSolicitudes(): Promise<Solicitud[]> {
  const s = await createClient();
  const { data } = await s.from("solicitudes").select("*").order("creado_en", { ascending: false });
  return (data ?? []).map(mapSolicitud);
}
export async function getSolicitudesNuevas(): Promise<Solicitud[]> {
  const s = await createClient();
  const { data } = await s.from("solicitudes").select("*").eq("estado", "NUEVA");
  return (data ?? []).map(mapSolicitud);
}
export async function getSolicitudById(
  id: string,
): Promise<Solicitud | undefined> {
  const s = await createClient();
  const { data } = await s.from("solicitudes").select("*").eq("id", id).maybeSingle();
  return data ? mapSolicitud(data) : undefined;
}
export async function crearSolicitud(orgId: string, d: {
  nombre: string;
  contacto: string;
  carrera: string;
  temaInteres: string;
  preferencia: Solicitud["preferencia"];
  mensaje?: string;
}): Promise<Solicitud> {
  const s = await createClient();
  const fila = {
    id: `s-${Date.now()}`,
    nombre: d.nombre,
    contacto: d.contacto,
    carrera: d.carrera,
    tema_interes: d.temaInteres,
    preferencia: d.preferencia,
    mensaje: d.mensaje ?? null,
    estado: "NUEVA" as const,
    // Explícito: el formulario es anónimo, así que la base no puede deducir
    // la academia de la sesión.
    organizacion_id: orgId,
  };
  // El formulario es PÚBLICO (usuario anónimo). La policy RLS permite el INSERT
  // pero NO el SELECT (la lectura es solo admin); por eso NO encadenamos
  // .select() —devolvía 0 filas y rompía la página—. Armamos el objeto a mano.
  const { error } = await s.from("solicitudes").insert(fila);
  if (error) throw new Error(error.message);

  await notificarAdmins(orgId, {
    titulo: "Nueva inscripción desde la web",
    cuerpo: `${d.nombre}${d.carrera ? ` (${d.carrera})` : ""} se anotó por la página. Entrá a Solicitudes para convertirla en alumna.`,
    url: "/panel/solicitudes",
  });
  return mapSolicitud({ ...fila, creado_en: new Date().toISOString() });
}
export async function setEstadoSolicitud(
  id: string,
  estado: Solicitud["estado"],
): Promise<void> {
  const s = await createClient();
  await s.from("solicitudes").update({ estado }).eq("id", id);
}
export async function eliminarSolicitud(id: string): Promise<boolean> {
  const s = await createClient();
  const { error } = await s.from("solicitudes").delete().eq("id", id);
  return !error;
}
