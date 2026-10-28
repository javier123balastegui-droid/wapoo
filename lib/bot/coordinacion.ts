import "server-only";
import { dbDeOrg, type DbDeOrg } from "@/lib/supabase/org";
import {
  resolverReagendaGrupal,
  validarSlot,
  type DecisionMiembro,
} from "@/lib/bot/acciones";
import { enviarWhatsApp, enviarPlantilla, PLANTILLAS } from "@/lib/bot/whatsapp";
import { anotarEnvioAutomatico } from "@/lib/bot/conversaciones";
import { avisarProfeDeCambio } from "@/lib/bot/avisos-profe";
import { notificarAdmins } from "@/lib/push";
import { montoTexto } from "@/lib/utils";
import { getOrganizacion, monedaDe } from "@/lib/organizacion";

/**
 * Coordinación grupal de reagenda.
 *
 * Cuando un integrante de una clase GRUPAL pide reagendar, el bot propone un
 * nuevo día/hora y hay que consultar a CADA uno de los demás integrantes. Acá
 * se lleva el estado de esa consulta (tablas reagendas_grupales*) hasta que
 * respondan todos; ahí se aplica el reparto/recotización (motor
 * `resolverReagendaGrupal`) y se le confirma a cada uno.
 *
 * El envío a los integrantes usa `enviarWhatsApp` (que en seco solo loguea hasta
 * que estén cargadas las credenciales de WhatsApp).
 */

type DB = DbDeOrg;

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
function fechaHum(iso: string): string {
  const [y, mo, d] = iso.split("-");
  return `${d}/${mo}/${y}`;
}
function solapan(aIni: number, aDur: number, bIni: number, bDur: number): boolean {
  return aIni < bIni + bDur && bIni < aIni + aDur;
}
function primerNombre(nombre: string): string {
  return (nombre || "").trim().split(/\s+/)[0] || "";
}


async function alumnoPorContacto(
  db: DB,
  contacto: string,
): Promise<{ id: string; nombre: string } | null> {
  const { data } = await db
    .from("alumnos")
    .select("id, nombre")
    .eq("telefono", contacto)
    .limit(1);
  return data?.[0] ?? null;
}

export type ResultadoIniciar =
  | { ok: true; integrantesConsultados: number }
  | {
      ok: false;
      motivo:
        | "sin_perfil"
        | "clase_no_encontrada"
        | "no_es_grupal"
        | "slot_invalido"
        | "solapa"
        | "ya_en_curso";
      detalle?: string;
    };

/** Arranca la consulta al grupo: crea el registro, deja al iniciador como
 *  "se mueve" y a los demás pendientes, y les manda un WhatsApp preguntándoles. */
export async function iniciarCoordinacionGrupal(
  orgId: string,
  contactoIniciador: string,
  fechaActual: string,
  inicioActual: number,
  propFecha: string,
  propInicio: number,
  propDuracion?: number,
): Promise<ResultadoIniciar> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");

  const ini = await alumnoPorContacto(db, contactoIniciador);
  if (!ini) return { ok: false, motivo: "sin_perfil" };

  const { data: links } = await db
    .from("clase_alumnos")
    .select("clase_id")
    .eq("alumno_id", ini.id);
  const misIds = (links ?? []).map((l) => l.clase_id);
  if (misIds.length === 0) return { ok: false, motivo: "clase_no_encontrada" };

  const { data: clases } = await db
    .from("clases")
    .select("id, tipo, fecha, inicio_min, duracion")
    .in("id", misIds)
    .eq("fecha", fechaActual)
    .eq("inicio_min", inicioActual);
  const clase = clases?.[0];
  if (!clase) return { ok: false, motivo: "clase_no_encontrada" };

  const { data: miembrosLinks } = await db
    .from("clase_alumnos")
    .select("alumno_id")
    .eq("clase_id", clase.id);
  const miembroIds = (miembrosLinks ?? []).map((m) => m.alumno_id);
  if (miembroIds.length < 2) return { ok: false, motivo: "no_es_grupal" };

  const dur = propDuracion ?? clase.duracion;
  const err = await validarSlot(orgId, propFecha, propInicio, dur);
  if (err) return { ok: false, motivo: "slot_invalido", detalle: err };

  const { data: clasesProp } = await db
    .from("clases")
    .select("id, inicio_min, duracion")
    .eq("fecha", propFecha);
  for (const o of clasesProp ?? []) {
    if (o.id === clase.id) continue;
    if (solapan(propInicio, dur, o.inicio_min, o.duracion))
      return { ok: false, motivo: "solapa" };
  }

  const { data: yaHay } = await db
    .from("reagendas_grupales")
    .select("id")
    .eq("clase_id", clase.id)
    .eq("estado", "EN_CURSO")
    .limit(1);
  if (yaHay && yaHay.length > 0) return { ok: false, motivo: "ya_en_curso" };

  const reagendaId = `rg-${Date.now()}`;
  await db.from("reagendas_grupales").insert({
    id: reagendaId,
    clase_id: clase.id,
    iniciador_alumno_id: ini.id,
    prop_fecha: propFecha,
    prop_inicio_min: propInicio,
    prop_duracion: dur,
  });

  const ahoraISO = new Date().toISOString();
  await db.from("reagendas_grupales_respuestas").insert(
    miembroIds.map((id: string) => ({
      reagenda_id: reagendaId,
      alumno_id: id,
      respuesta: id === ini.id ? "MOVER" : "PENDIENTE",
      respondido_en: id === ini.id ? ahoraISO : null,
    })),
  );

  const otros = miembroIds.filter((id: string) => id !== ini.id);
  const { data: datosOtros } = await db
    .from("alumnos")
    .select("id, nombre, telefono")
    .in("id", otros);
  for (const a of datosOtros ?? []) {
    if (!a.telefono) continue;
    // Plantilla `consulta_reagenda_grupal` — variables: nombre, iniciador,
    // horario actual, horario propuesto.
    const actual = `${fechaHum(clase.fecha)} a las ${hhmm(clase.inicio_min)}`;
    const propuesto = `${fechaHum(propFecha)} a las ${hhmm(propInicio)}`;
    const envio = await enviarPlantilla(orgId, a.telefono, PLANTILLAS.CONSULTA_GRUPAL, [
      primerNombre(a.nombre),
      primerNombre(ini.nombre),
      actual,
      propuesto,
    ]);
    if (envio.enviado) {
      await anotarEnvioAutomatico(
        orgId,
        a.telefono,
        `${primerNombre(ini.nombre)} propuso mover la clase grupal del ${actual} al ${propuesto}; le preguntamos si se mueve o se queda.`,
      );
    }
  }

  return { ok: true, integrantesConsultados: otros.length };
}

export type PendienteCoord = {
  iniciadorNombre: string;
  claseFechaHum: string;
  claseHora: string;
  propFechaHum: string;
  propHora: string;
};

/** Si el contacto tiene una consulta grupal pendiente de responder, devuelve sus
 *  datos (para que el bot sepa interpretar su próxima respuesta). */
export async function coordinacionPendientePara(
  orgId: string,
  contacto: string,
): Promise<PendienteCoord | null> {
  const db = dbDeOrg(orgId);
  if (!db) return null;

  const al = await alumnoPorContacto(db, contacto);
  if (!al) return null;

  const { data: resp } = await db
    .from("reagendas_grupales_respuestas")
    .select("reagenda_id")
    .eq("alumno_id", al.id)
    .eq("respuesta", "PENDIENTE");
  const reagIds = (resp ?? []).map((r) => r.reagenda_id);
  if (reagIds.length === 0) return null;

  const { data: reags } = await db
    .from("reagendas_grupales")
    .select("id, clase_id, iniciador_alumno_id, prop_fecha, prop_inicio_min")
    .in("id", reagIds)
    .eq("estado", "EN_CURSO")
    .limit(1);
  const reag = reags?.[0];
  if (!reag) return null;

  const { data: ini } = await db
    .from("alumnos")
    .select("nombre")
    .eq("id", reag.iniciador_alumno_id)
    .maybeSingle();
  const { data: clase } = await db
    .from("clases")
    .select("fecha, inicio_min")
    .eq("id", reag.clase_id)
    .maybeSingle();

  return {
    iniciadorNombre: primerNombre(ini?.nombre ?? "otro alumno"),
    claseFechaHum: clase ? fechaHum(clase.fecha) : "",
    claseHora: clase ? hhmm(clase.inicio_min) : "",
    propFechaHum: fechaHum(reag.prop_fecha),
    propHora: hhmm(reag.prop_inicio_min),
  };
}

/** Cómo quedó la clase de un integrante después del reparto. */
export type ClaseResuelta = {
  fechaHum: string;
  hora: string;
  tipo: string;
  integrantes: number;
  precioPorAlumno: number;
};

export type ResultadoRespuesta =
  | {
      ok: true;
      resuelta: boolean;
      faltan: number;
      /** Solo cuando quedó resuelta: cómo le quedó la clase a QUIEN respondió.
       *  Sirve para avisarle si se quedó solo y la clase pasa a individual. */
      tuClase?: ClaseResuelta;
    }
  | { ok: false; motivo: "sin_perfil" | "sin_pendiente" };

/** Registra la respuesta de un integrante (se mueve o se queda). Si con esta
 *  respuesta ya contestaron todos, resuelve el reparto y avisa a cada uno. */
export async function registrarRespuestaCoordinacion(
  orgId: string,
  contacto: string,
  quiereMover: boolean,
): Promise<ResultadoRespuesta> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");

  const al = await alumnoPorContacto(db, contacto);
  if (!al) return { ok: false, motivo: "sin_perfil" };

  const { data: resp } = await db
    .from("reagendas_grupales_respuestas")
    .select("reagenda_id")
    .eq("alumno_id", al.id)
    .eq("respuesta", "PENDIENTE");
  const reagIds = (resp ?? []).map((r) => r.reagenda_id);
  if (reagIds.length === 0) return { ok: false, motivo: "sin_pendiente" };

  const { data: reags } = await db
    .from("reagendas_grupales")
    .select("id, clase_id, prop_fecha, prop_inicio_min, prop_duracion")
    .in("id", reagIds)
    .eq("estado", "EN_CURSO")
    .limit(1);
  const reag = reags?.[0];
  if (!reag) return { ok: false, motivo: "sin_pendiente" };

  await db
    .from("reagendas_grupales_respuestas")
    .update({
      respuesta: quiereMover ? "MOVER" : "QUEDARSE",
      respondido_en: new Date().toISOString(),
    })
    .eq("reagenda_id", reag.id)
    .eq("alumno_id", al.id);

  const { data: pendientes } = await db
    .from("reagendas_grupales_respuestas")
    .select("alumno_id")
    .eq("reagenda_id", reag.id)
    .eq("respuesta", "PENDIENTE");
  const faltan = (pendientes ?? []).length;
  if (faltan > 0) return { ok: true, resuelta: false, faltan };

  // A quien acaba de responder le contesta el bot en este mismo chat, con el
  // detalle: no le mandamos además el aviso automático.
  const detalles = await resolverYNotificar(orgId, db, reag, al.id);
  return { ok: true, resuelta: true, faltan: 0, tuClase: detalles.get(al.id) };
}

async function resolverYNotificar(
  orgId: string,
  db: DB,
  reag: {
    id: string;
    clase_id: string;
    prop_fecha: string;
    prop_inicio_min: number;
    prop_duracion: number;
  },
  /** A este integrante no se le manda el aviso: le responde el bot en su chat. */
  omitir?: string,
): Promise<Map<string, ClaseResuelta>> {
  const { data: respuestas } = await db
    .from("reagendas_grupales_respuestas")
    .select("alumno_id, respuesta")
    .eq("reagenda_id", reag.id);
  const lista = respuestas ?? [];

  const decisiones: DecisionMiembro[] = lista.map((r) =>
    r.respuesta === "MOVER"
      ? {
          alumnoId: r.alumno_id,
          accion: "mover",
          fecha: reag.prop_fecha,
          inicioMin: reag.prop_inicio_min,
          duracionMin: reag.prop_duracion,
          grupo: "propuesta",
        }
      : { alumnoId: r.alumno_id, accion: "quedarse" },
  );

  // Guardamos el día original ANTES de resolver (después la clase cambia/se borra).
  const { data: claseOrig } = await db
    .from("clases")
    .select("fecha")
    .eq("id", reag.clase_id)
    .maybeSingle();
  const fechaOrig = claseOrig?.fecha as string | undefined;

  const resultado = await resolverReagendaGrupal(orgId, reag.clase_id, decisiones);
  await db
    .from("reagendas_grupales")
    .update({ estado: "RESUELTA" })
    .eq("id", reag.id);
  if (!resultado.ok) return new Map();

  // Avisar al profe: su agenda del día propuesto y del día original.
  await avisarProfeDeCambio(orgId, reag.prop_fecha, null);
  if (fechaOrig && fechaOrig !== reag.prop_fecha)
    await avisarProfeDeCambio(orgId, fechaOrig, null);

  // Y al equipo: una clase grupal se repartió sola por chat y los precios se
  // recotizaron, así que conviene que lo miren.
  await notificarAdmins(orgId, {
    titulo: "Se repartió una clase grupal",
    cuerpo: `El bot resolvió la reagenda: quedaron ${resultado.clases.length} ${resultado.clases.length === 1 ? "clase" : "clases"} (${resultado.clases.map((c) => `${c.fechaHum} ${c.hora}, ${c.integrantes.length} alumna${c.integrantes.length === 1 ? "" : "s"}`).join(" · ")}). Los precios se recalcularon.`,
    url: "/panel/agenda",
  });

  // Identificar la clase de los que se movieron (la del horario propuesto) y la
  // de los que se quedaron (la otra, si quedó alguien).
  const horaProp = hhmm(reag.prop_inicio_min);
  const fechaProp = fechaHum(reag.prop_fecha);
  const claseMovidos = resultado.clases.find(
    (c) => c.hora === horaProp && c.fechaHum === fechaProp,
  );
  const claseQuedan = resultado.clases.find((c) => c !== claseMovidos);

  const ids = lista.map((r) => r.alumno_id);
  const { data: datos } = await db
    .from("alumnos")
    .select("id, nombre, telefono")
    .in("id", ids);
  const datosById = new Map<string, { nombre: string; telefono: string | null }>();
  for (const a of datos ?? [])
    datosById.set(a.id, { nombre: a.nombre, telefono: a.telefono });

  const detalles = new Map<string, ClaseResuelta>();
  for (const r of lista) {
  // Los montos, en la moneda de la academia.
  const moneda = monedaDe(await getOrganizacion(orgId));
  const pesos = (n: number) => montoTexto(n, moneda);
    const suya = r.respuesta === "MOVER" ? claseMovidos : claseQuedan;
    if (suya) {
      detalles.set(r.alumno_id, {
        fechaHum: suya.fechaHum,
        hora: suya.hora,
        tipo: suya.tipo,
        integrantes: suya.integrantes.length,
        precioPorAlumno: suya.precioPorAlumno,
      });
    }
    const info = datosById.get(r.alumno_id);
    if (!info?.telefono || r.alumno_id === omitir) continue;
    const nombre = primerNombre(info.nombre);

    if (r.respuesta === "MOVER" && claseMovidos) {
      const cuantos = claseMovidos.integrantes.length;
      const como =
        claseMovidos.tipo === "INDIVIDUAL"
          ? "como clase individual"
          : `en grupo de ${cuantos}`;
      await enviarWhatsApp(
        orgId,
        info.telefono,
        `Listo ${nombre}! 🙌 Quedó confirmada la reagenda: tu clase pasa al ${claseMovidos.fechaHum} a las ${claseMovidos.hora}, ${como}. ` +
          `El valor queda en ${pesos(claseMovidos.precioPorAlumno)} por hora. La seña que ya habías pagado se mantiene 💪`,
      );
    } else if (r.respuesta === "QUEDARSE" && claseQuedan) {
      const cuantos = claseQuedan.integrantes.length;
      const como =
        claseQuedan.tipo === "INDIVIDUAL"
          ? "Como quedás con esa clase para vos solo/a, pasa a ser individual"
          : `Ahora quedan ${cuantos} en esa clase`;
      await enviarWhatsApp(
        orgId,
        info.telefono,
        `Listo ${nombre}! Tu clase se mantiene el ${claseQuedan.fechaHum} a las ${claseQuedan.hora}. ` +
          `${como}, así que el valor queda en ${pesos(claseQuedan.precioPorAlumno)} por hora. La seña que ya habías pagado se mantiene 🙌`,
      );
    }
  }
  return detalles;
}
