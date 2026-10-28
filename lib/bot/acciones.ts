import "server-only";
import { dbDeOrg, type DbDeOrg } from "@/lib/supabase/org";
import { normalizarTelefono } from "@/lib/bot/config";
import { duracionValida, mensajeDuracionInvalida } from "@/lib/agenda-reglas";
import { getOrganizacion, ventanaDeOrg, horariosEnPalabras, anticipacionReagenda, reglasDe, monedaDe, zonaDe } from "@/lib/organizacion";
import { motivoDiaSinClase } from "@/lib/disponibilidad";
import {
  parseFecha,
  ahoraEn,
  hoyEn,
  etiquetaDeZona,
  zonaDeTelefono,
} from "@/lib/fechas";
import {
  setEstadoConversacion,
  getOrCreateConversacion,
} from "@/lib/bot/conversaciones";
import { avisarProfeDeCambio } from "@/lib/bot/avisos-profe";
import { notificarAdmins } from "@/lib/push";
import { precioAlumno } from "@/lib/precios";
import { montoTexto } from "@/lib/utils";

/** Pasa la conversación a modo humano: el bot deja de responder y queda en manos
 *  de la directora. Se usa cuando el bot deriva a una persona. */
export async function derivarAHumano(orgId: string, contacto: string): Promise<void> {
  await setEstadoConversacion(orgId, contacto, "HUMANO");
  // Alguien quedó esperando respuesta de una persona: es el aviso más urgente
  // de todos, porque del otro lado hay alguien escribiendo.
  // Solo a la dirección: quién está hablando con el bot y sobre qué es
  // información de la charla, no de la agenda.
  await notificarAdmins(orgId, {
    titulo: "El bot te pasó una conversación",
    cuerpo: `Hay alguien esperando respuesta por WhatsApp (${contacto}). El bot dejó de responder esa charla.`,
    url: "/panel/bot",
  });
}

/**
 * Vincula el WhatsApp de quien escribe con un perfil que ya existe. Hace
 * falta porque a los compañeros de una clase grupal los da de alta quien
 * arma el grupo, sin su número: cuando el compañero escribe, el bot no lo
 * reconoce. Se pide el mail con el que quedó registrado, para no vincular el
 * perfil de otra persona solo por el nombre.
 */
export async function vincularPerfilAlumno(
  orgId: string,
  contacto: string,
  email: string,
): Promise<
  | { ok: true; nombre: string; codigoAcceso: string }
  | { ok: false; motivo: "sin_perfil" | "otro_telefono" }
> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  const { data } = await db
    .from("alumnos")
    .select("id, nombre, codigo_acceso, telefono")
    .eq("email", email.trim())
    .limit(1);
  const alumno = data?.[0];
  if (!alumno) return { ok: false, motivo: "sin_perfil" };
  if (alumno.telefono && alumno.telefono !== contacto) {
    return { ok: false, motivo: "otro_telefono" };
  }
  await db.from("alumnos").update({ telefono: contacto }).eq("id", alumno.id);
  return { ok: true, nombre: alumno.nombre, codigoAcceso: alumno.codigo_acceso };
}

/** Precios vigentes, los mismos que se cargan en Panel → Finanzas. El bot los
 *  lee en cada respuesta: así un cambio de precio en el panel le llega al
 *  instante, en vez de quedar un monto viejo escrito en sus instrucciones. */
export async function preciosVigentes(orgId: string): Promise<{
  valorIndividual: number;
  valorGrupal2: number;
  valorGrupal3: number;
  valorSena: number;
} | null> {
  const db = dbDeOrg(orgId);
  if (!db) return null;
  const { data, error } = await db
    .from("precios")
    .select("valor_individual, valor_grupal_2, valor_grupal_3, valor_sena")
    .maybeSingle();
  if (error || !data) return null;
  return {
    valorIndividual: Number(data.valor_individual ?? 0),
    valorGrupal2: Number(data.valor_grupal_2 ?? 0),
    valorGrupal3: Number(data.valor_grupal_3 ?? 0),
    valorSena: Number(data.valor_sena ?? 0),
  };
}

/**
 * El bot no sabe responder algo (un dato del equipo, un tema que no encontró ni
 * en la biblioteca ni en internet) y se lo pasa a la dirección. A diferencia de
 * derivarAHumano, la conversación sigue con el bot: la directora contesta esa
 * pregunta desde el panel cuando pueda. Nunca tira error.
 */
export async function consultarALaDirectora(
  orgId: string,
  contacto: string,
  pregunta: string,
): Promise<void> {
  const [conversacion, alumno] = await Promise.all([
    getOrCreateConversacion(orgId, contacto),
    datosAlumnoDeContacto(orgId, contacto),
  ]);
  const quien = alumno?.nombre ?? contacto;
  await notificarAdmins(orgId, {
    titulo: "Consulta para vos",
    cuerpo: `${quien}: ${pregunta.length > 110 ? `${pregunta.slice(0, 109)}…` : pregunta}`,
    url: `/panel/bot/${conversacion.id}`,
  });
}

/**
 * El bot vio un comprobante de pago y le avisa a la dirección con lo que leyó.
 * Lo decide el bot, y no la llegada de cualquier archivo, para que la foto de
 * un esquema no dispare un aviso de pago. Nunca tira error.
 */
export async function avisarComprobante(
  orgId: string,
  contacto: string,
  leido: { monto: string; fecha: string; coincide: boolean; observacion: string },
): Promise<void> {
  const [conversacion, alumno] = await Promise.all([
    getOrCreateConversacion(orgId, contacto),
    datosAlumnoDeContacto(orgId, contacto),
  ]);
  const quien = alumno?.nombre ?? contacto;
  const detalle = [leido.monto, leido.fecha].filter(Boolean).join(" del ");
  await notificarAdmins(orgId, {
    titulo: leido.coincide ? "Comprobante OK" : "Revisar comprobante",
    cuerpo:
      `${quien}: ${detalle || "comprobante de pago"}` +
      (leido.coincide || !leido.observacion ? "" : ` · ${leido.observacion}`),
    url: `/panel/bot/${conversacion.id}`,
  });
}

/**
 * Acciones que el bot puede ejecutar en la plataforma (las "herramientas" que
 * usa Claude). Todo pasa por el cliente admin (service key), porque el bot no
 * tiene una sesión de admin logueada.
 */

export type PerfilCreado = {
  id: string;
  nombre: string;
  codigoAcceso: string;
  /** true si el alumno YA estaba dado de alta (no se creó uno nuevo). */
  yaExistia: boolean;
};

/**
 * Da de alta un alumno en la plataforma y devuelve su código de acceso
 * (lo genera sola la base de datos vía DEFAULT en la columna `codigo_acceso`).
 * `telefono` normalmente es el contacto de WhatsApp del alumno.
 *
 * Si ya existe un alumno con ese teléfono (o ese email), NO crea uno nuevo:
 * devuelve el existente con su código, para no duplicar perfiles.
 */
export async function crearPerfilAlumno(orgId: string, d: {
  nombre: string;
  carrera: string;
  email?: string;
  telefono?: string;
  /** Solo si el alumno dijo que está fuera del país. Vacío = Argentina. */
  zonaHoraria?: string;
}): Promise<PerfilCreado> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");

  // Evitar duplicados. El mail identifica a la persona: si viene, manda él.
  // El teléfono solo alcanza cuando no hay mail, porque desde un mismo chat se
  // da de alta también a los compañeros, y buscar por teléfono devolvía el
  // perfil de quien escribe (y el compañero nunca se creaba).
  const buscar = async (filtro: string) => {
    const { data } = await db
      .from("alumnos")
      .select("id, nombre, codigo_acceso")
      .or(filtro)
      .limit(1);
    return data?.[0];
  };
  const ya = d.email
    ? await buscar(`email.eq.${d.email}`)
    : d.telefono
      ? await filaAlumnoPorTelefono(db, d.telefono)
      : undefined;
  if (ya?.codigo_acceso) {
    return {
      id: ya.id,
      nombre: ya.nombre,
      codigoAcceso: ya.codigo_acceso,
      yaExistia: true,
    };
  }

  // El teléfono es de quien escribe: si ya es de otro alumno, este perfil (un
  // compañero) se crea sin teléfono, y se vincula cuando escriba él mismo.
  const duenoDelTelefono = d.telefono
    ? await filaAlumnoPorTelefono(db, d.telefono)
    : undefined;
  const telefono = duenoDelTelefono ? null : (d.telefono ?? null);

  // Zona horaria: manda lo que dijo el alumno; si no dijo nada, se deduce del
  // prefijo de su número. Se deduce solo sobre el teléfono que de verdad queda
  // guardado: para un compañero (que se crea sin teléfono) no se adivina nada
  // a partir del número de quien escribe.
  const deducida = d.zonaHoraria ? null : zonaDeTelefono(telefono, await zonaDe(orgId));
  const zona = d.zonaHoraria || deducida?.zona || "";

  const { data, error } = await db
    .from("alumnos")
    .insert({
      id: `a-${Date.now()}`,
      nombre: d.nombre,
      carrera: d.carrera,
      email: d.email ?? null,
      telefono,
      zona_horaria: zona,
      notas: "Alta automática desde el bot de WhatsApp.",
    })
    .select("id, nombre, codigo_acceso")
    .single();

  if (error) throw new Error(error.message);
  if (!data?.codigo_acceso) {
    throw new Error(
      "El alumno se creó pero la base no devolvió el código de acceso.",
    );
  }

  await notificarAdmins(orgId, {
    titulo: "Alumna nueva por WhatsApp",
    cuerpo:
      `${d.nombre}${d.carrera ? ` (${d.carrera})` : ""} se dio de alta hablando con el bot. ` +
      // Si no está en Argentina se avisa, y se aclara si lo dijo ella o si se
      // sacó del prefijo del número (que puede estar mal y conviene revisar).
      (zona
        ? deducida
          ? `Por el prefijo parece estar en ${deducida.etiqueta}: revisalo en su ficha. `
          : `Está en ${etiquetaDeZona(zona)}, no en Argentina. `
        : "") +
      "Ya tiene su código para agendar.",
    url: `/panel/alumnos/${data.id}`,
  });

  return {
    id: data.id,
    nombre: data.nombre,
    codigoAcceso: data.codigo_acceso,
    yaExistia: false,
  };
}

/** Datos básicos del alumno asociado a un contacto (teléfono), si ya tiene
 *  perfil. Sirve para que el bot reconozca a un alumno que ya escribió antes. */
export async function datosAlumnoDeContacto(
  orgId: string,
  contacto: string,
): Promise<{ nombre: string; codigoAcceso: string; zonaHoraria: string } | null> {
  const db = dbDeOrg(orgId);
  if (!db) return null;
  const a = await filaAlumnoPorTelefono(db, contacto);
  if (!a?.codigo_acceso) return null;
  return {
    nombre: String(a.nombre ?? ""),
    codigoAcceso: String(a.codigo_acceso),
    zonaHoraria: String(a.zona_horaria ?? ""),
  };
}

/** Los compañeros con los que este alumno ya tomó clases grupales antes,
 *  del más frecuente al menos frecuente. Como las grupales las suele tomar
 *  siempre el mismo grupo, esta lista le permite al bot entender apodos
 *  ("el Tomi", "la Juli") y proponer el grupo de siempre. */
/**
 * ¿Esta persona tiene derecho a que el bot le resuelva dudas de estudio?
 *
 * El número del bot se pasa de boca en boca, así que sin esto cualquiera que
 * lo consiga tiene un profesor de anatomía gratis, con la bibliografía de la
 * cátedra incluida. Las consultas son parte de la clase, no un servicio
 * aparte.
 *
 * Tiene derecho quien ya es alumno de verdad: con una clase dada, o con una
 * agendada y señada. Una clase agendada sin pagar no alcanza, porque agendar
 * no cuesta nada y sería la forma obvia de saltear esto.
 *
 * No bloquea nada más: precios, cómo son las clases, darse de alta, agendar y
 * confirmar la seña se siguen atendiendo a cualquiera. Lo que se protege es el
 * trabajo del profesor, no la venta.
 */
export async function puedeConsultarDudas(
  orgId: string,
  contacto: string,
): Promise<{ habilitado: boolean; motivo: "sin_perfil" | "sin_clases" | "ok" }> {
  const db = dbDeOrg(orgId);
  if (!db) return { habilitado: false, motivo: "sin_perfil" };

  const alumnoId = await buscarAlumnoId(db, contacto);
  if (!alumnoId) return { habilitado: false, motivo: "sin_perfil" };

  const { data: enlaces } = await db
    .from("clase_alumnos")
    .select("clase_id")
    .eq("alumno_id", alumnoId);
  const ids = (enlaces ?? []).map((e) => e.clase_id as string);
  if (ids.length === 0) return { habilitado: false, motivo: "sin_clases" };

  // Una clase ya dada habilita para siempre: el alumno ya pagó por su tiempo.
  const { count: dadas } = await db
    .from("clases")
    .select("id", { count: "exact", head: true })
    .in("id", ids)
    .eq("estado_realizacion", "REALIZADA");
  if ((dadas ?? 0) > 0) return { habilitado: true, motivo: "ok" };

  // O una agendada con la seña puesta (señada o pagada por completo).
  const { count: senadas } = await db
    .from("pagos")
    .select("id", { count: "exact", head: true })
    .eq("alumno_id", alumnoId)
    .in("clase_id", ids)
    .in("estado", ["SENADO", "PAGADO"]);
  if ((senadas ?? 0) > 0) return { habilitado: true, motivo: "ok" };

  return { habilitado: false, motivo: "sin_clases" };
}

export async function companerosHabituales(orgId: string, contacto: string): Promise<string[]> {
  const db = dbDeOrg(orgId);
  if (!db) return [];
  const alumnoId = await buscarAlumnoId(db, contacto);
  if (!alumnoId) return [];

  const { data: propias } = await db
    .from("clase_alumnos")
    .select("clase_id")
    .eq("alumno_id", alumnoId);
  const idsPropios = (propias ?? []).map((l) => l.clase_id as string);
  if (!idsPropios.length) return [];

  const { data: grupales } = await db
    .from("clases")
    .select("id")
    .in("id", idsPropios)
    .eq("tipo", "GRUPAL");
  const idsGrupales = (grupales ?? []).map((c) => c.id as string);
  if (!idsGrupales.length) return [];

  const { data: links } = await db
    .from("clase_alumnos")
    .select("alumno_id")
    .in("clase_id", idsGrupales);

  // Cuántas clases compartió con cada compañero (para ordenar por frecuencia).
  const veces = new Map<string, number>();
  for (const l of links ?? []) {
    const id = l.alumno_id as string;
    if (id === alumnoId) continue;
    veces.set(id, (veces.get(id) ?? 0) + 1);
  }
  if (!veces.size) return [];

  const { data: alumnos } = await db
    .from("alumnos")
    .select("id, nombre")
    .in("id", [...veces.keys()]);

  return (alumnos ?? [])
    .map((a) => ({ nombre: a.nombre as string, n: veces.get(a.id as string) ?? 0 }))
    .sort((a, b) => b.n - a.n)
    .map((a) => a.nombre);
}

function hhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Una clase cobrable del alumno, con su cuenta hecha. */
type ClaseEnCuenta = {
  id: string;
  fecha: string;
  fechaHum: string;
  hora: string;
  tipo: string;
  duracionMin: number;
  integrantes: number;
  /** Lo que le toca pagar a ESTE alumno por esta clase. */
  precio: number;
  /** Lo que ya entregó. */
  yaPago: number;
  /** Lo que todavía falta (0 si está saldada). */
  falta: number;
  estado: "SIN_PAGAR" | "SENADO" | "PAGADO";
  /** Id de la fila de pagos, si ya existe. */
  pagoId: string | null;
};

/**
 * La cuenta de un alumno: sus clases cobrables con el precio, lo entregado y
 * lo que falta, de la más vieja a la más nueva.
 *
 * Lo usan TANTO el estado de cuenta que le muestra el bot COMO el registro de
 * un pago, a propósito: si cada uno hiciera su propia cuenta, un día le diría
 * al alumno que debe una cosa y le imputaría otra.
 *
 * Cobrables son las que se dieron y las que todavía no (una reagendada o
 * cancelada no se cobra). Mismo criterio que Finanzas.
 */
async function cuentaDelAlumno(
  db: DbDeOrg,
  alumnoId: string,
): Promise<ClaseEnCuenta[]> {
  const { data: mios } = await db
    .from("clase_alumnos")
    .select("clase_id")
    .eq("alumno_id", alumnoId);
  const ids = (mios ?? []).map((l) => l.clase_id as string);
  if (ids.length === 0) return [];

  const { data: clases } = await db
    .from("clases")
    .select("id, fecha, inicio_min, duracion, tipo")
    .in("id", ids)
    .in("estado_realizacion", ["REALIZADA", "PENDIENTE"])
    .order("fecha")
    .order("inicio_min");
  if (!clases || clases.length === 0) return [];

  const idsCobrables = clases.map((c) => c.id as string);

  // Cuántos toman cada clase: en las grupales el precio por alumno baja.
  const { data: integrantes } = await db
    .from("clase_alumnos")
    .select("clase_id")
    .in("clase_id", idsCobrables);
  const cuantos = new Map<string, number>();
  for (const i of integrantes ?? []) {
    const k = i.clase_id as string;
    cuantos.set(k, (cuantos.get(k) ?? 0) + 1);
  }

  const { data: precios } = await db
    .from("precios")
    .select("valor_individual, valor_grupal_2, valor_grupal_3")
    .maybeSingle();
  const tarifas = {
    valorIndividual: Number(precios?.valor_individual ?? 0),
    valorGrupal2: Number(precios?.valor_grupal_2 ?? 0),
    valorGrupal3: Number(precios?.valor_grupal_3 ?? 0),
  };

  const { data: pagos } = await db
    .from("pagos")
    .select("id, clase_id, estado, monto")
    .eq("alumno_id", alumnoId)
    .in("clase_id", idsCobrables);
  const pagoDe = new Map<string, { id: string; estado: string; monto: number }>();
  for (const p of pagos ?? []) {
    pagoDe.set(p.clase_id as string, {
      id: String(p.id),
      estado: String(p.estado),
      monto: Number(p.monto ?? 0),
    });
  }

  return clases.map((c) => {
    const pago = pagoDe.get(c.id as string);
    const estado = (pago?.estado ?? "SIN_PAGAR") as ClaseEnCuenta["estado"];
    const precio = precioAlumno(
      tarifas,
      c.tipo as "INDIVIDUAL" | "GRUPAL",
      cuantos.get(c.id as string) ?? 1,
      Number(c.duracion),
    );
    // Lo entregado: en PAGADO es todo; en SENADO, lo que figura en la fila.
    const yaPago =
      estado === "PAGADO" ? precio : estado === "SENADO" ? (pago?.monto ?? 0) : 0;
    const [y, mo, d] = String(c.fecha).split("-");
    return {
      id: String(c.id),
      fecha: String(c.fecha),
      fechaHum: `${d}/${mo}/${y}`,
      hora: hhmm(Number(c.inicio_min)),
      tipo: String(c.tipo),
      duracionMin: Number(c.duracion),
      integrantes: cuantos.get(c.id as string) ?? 1,
      precio,
      yaPago,
      falta: Math.max(0, precio - yaPago),
      estado,
      pagoId: pago?.id ?? null,
    };
  });
}

export type EstadoDeCuenta = {
  ok: boolean;
  /** Las clases que todavía deben algo. */
  pendientes: {
    fechaHum: string;
    hora: string;
    tipo: string;
    precio: number;
    yaPago: number;
    falta: number;
    estado: string;
    /** true si la clase ya se dio (deuda), false si está por venir. */
    yaSeDio: boolean;
  }[];
  /** Suma de todo lo que falta. */
  totalFalta: number;
  /** La seña, para poder ofrecerle señar en vez de pagar todo. */
  sena: number;
  motivo?: "sin_perfil";
};

/**
 * Cuánto debe el alumno, clase por clase. Para cuando pregunta "cuánto te
 * debo" y para que el bot sepa de qué montos está hablando antes de recibir un
 * comprobante.
 */
export async function estadoDeCuentaAlumno(
  orgId: string,
  contacto: string,
): Promise<EstadoDeCuenta> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");

  const alumno = await filaAlumnoPorTelefono(db, contacto);
  if (!alumno) {
    return { ok: false, motivo: "sin_perfil", pendientes: [], totalFalta: 0, sena: 0 };
  }

  const cuenta = await cuentaDelAlumno(db, String(alumno.id));
  const hoy = hoyEn(await zonaDe(orgId));
  const { data: precios } = await db
    .from("precios")
    .select("valor_sena")
    .maybeSingle();

  const pendientes = cuenta
    .filter((c) => c.falta > 0)
    .map((c) => ({
      fechaHum: c.fechaHum,
      hora: c.hora,
      tipo: c.tipo,
      precio: c.precio,
      yaPago: c.yaPago,
      falta: c.falta,
      estado: c.estado,
      yaSeDio: c.fecha < hoy,
    }));

  return {
    ok: true,
    pendientes,
    totalFalta: pendientes.reduce((s, c) => s + c.falta, 0),
    sena: Number(precios?.valor_sena ?? 0),
  };
}

export type ClaseDelPago = {
  fechaHum: string;
  hora: string;
  tipo: string;
  /** Cómo quedó esa clase después de aplicarle la plata. */
  estado: "SENADO" | "PAGADO";
  /** Lo que se le imputó a esta clase. */
  aplicado: number;
  /** Lo que todavía falta para esa clase (0 si quedó pagada). */
  falta: number;
};

/** Qué dijo el alumno que está pagando. */
export type ConceptoPago = "sena" | "total" | "lo_que_cubra";

export type ResultadoPago =
  | {
      ok: true;
      clases: ClaseDelPago[];
      /** Plata que sobró y no se imputó a ninguna clase. */
      sobrante: number;
    }
  | {
      ok: false;
      motivo: "sin_perfil" | "sin_clase_pendiente" | "no_alcanza";
      /** En "no_alcanza": lo mínimo que haría falta. */
      minimo?: number;
    };

/**
 * Registra un pago de cualquier monto y lo imputa a las clases que el alumno
 * debe, de la más vieja a la más nueva.
 *
 * Reemplaza a confirmarSenaAlumno, que solo sabía marcar UNA clase como señada
 * por el valor exacto de la seña. Por eso el bot no podía con los casos que
 * El cliente reportó: quien transfiere la clase completa, o dos o tres juntas,
 * caía fuera de lo único que la herramienta sabía hacer, y el bot lo trataba
 * como un error.
 *
 * La cuenta se hace acá y no en la conversación a propósito: el precio de cada
 * clase depende del tipo, de la duración y de cuántos la toman, y no se le pide
 * a un modelo que haga aritmética con la plata de alguien.
 *
 * El `concepto` existe porque el monto solo no alcanza para saber la
 * intención. Con una seña de 4.500 y clases de 9.500, un pago de 13.500 puede
 * ser "una clase completa y algo más" o "la seña de tres clases". Eso lo dice
 * el alumno con palabras, y el bot lo pasa acá:
 *
 *  - "sena": se le imputa exactamente la seña a cada clase, a tantas como
 *    alcance. Es el caso de "te paso la seña de las próximas tres".
 *  - "total": se paga clase por clase completa, a tantas como alcance.
 *  - "lo_que_cubra" (por defecto): de la más vieja a la más nueva, cubriendo
 *    todo lo que se pueda de cada una.
 *
 * Si sobra plata NO se inventa un crédito: se devuelve como `sobrante` para
 * que el bot lo diga y la dirección lo resuelva a mano.
 */
export async function registrarPagoAlumno(
  orgId: string,
  contacto: string,
  montoRecibido: number,
  concepto: ConceptoPago = "lo_que_cubra",
): Promise<ResultadoPago> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  if (!(montoRecibido > 0)) return { ok: false, motivo: "no_alcanza" };

  const alumno = await filaAlumnoPorTelefono(db, contacto);
  if (!alumno) return { ok: false, motivo: "sin_perfil" };
  const alumnoId = String(alumno.id);

  const cuenta = await cuentaDelAlumno(db, alumnoId);
  const deben = cuenta.filter((c) => c.falta > 0);
  if (deben.length === 0) return { ok: false, motivo: "sin_clase_pendiente" };

  const { data: precios } = await db
    .from("precios")
    .select("valor_sena")
    .maybeSingle();
  const sena = Number(precios?.valor_sena ?? 0);

  const hoy = hoyEn(await zonaDe(orgId));
  const aplicadas: ClaseDelPago[] = [];
  let restante = Math.round(montoRecibido);

  for (const c of deben) {
    if (restante <= 0) break;

    // Cuánto se le quiere poner a ESTA clase, según lo que dijo el alumno.
    const objetivo =
      concepto === "sena"
        ? Math.min(Math.max(sena - c.yaPago, 0), c.falta)
        : c.falta;
    if (objetivo <= 0) continue;

    let aplicado: number;
    if (restante >= objetivo) {
      aplicado = objetivo;
    } else if (c.yaPago > 0 || restante >= sena) {
      // No llega al objetivo, pero algo ya había puesto o cubre la seña.
      aplicado = restante;
    } else {
      // Ni para señar esta clase: se corta acá y lo que quede es sobrante.
      break;
    }

    const nuevoMonto = c.yaPago + aplicado;
    const nuevoEstado: "SENADO" | "PAGADO" =
      nuevoMonto >= c.precio ? "PAGADO" : "SENADO";

    if (c.pagoId) {
      await db
        .from("pagos")
        .update({ estado: nuevoEstado, monto: nuevoMonto, fecha: hoy })
        .eq("id", c.pagoId);
    } else {
      await db.from("pagos").insert({
        id: `p-${Date.now()}-${aplicadas.length}`,
        clase_id: c.id,
        alumno_id: alumnoId,
        estado: nuevoEstado,
        monto: nuevoMonto,
        fecha: hoy,
      });
    }

    restante -= aplicado;
    aplicadas.push({
      fechaHum: c.fechaHum,
      hora: c.hora,
      tipo: c.tipo,
      estado: nuevoEstado,
      aplicado,
      falta: Math.max(0, c.precio - nuevoMonto),
    });
  }

  if (aplicadas.length === 0) {
    return { ok: false, motivo: "no_alcanza", minimo: sena };
  }

  const moneda = monedaDe(await getOrganizacion(orgId));
  const detalle = aplicadas
    .map(
      (a) =>
        `${a.fechaHum} ${a.hora}: ${montoTexto(a.aplicado, moneda)}` +
        (a.estado === "PAGADO"
          ? " (pagada)"
          : ` (señada, falta ${montoTexto(a.falta, moneda)})`),
    )
    .join(" · ");
  await notificarAdmins(orgId, {
    titulo: restante > 0 ? "Pago con sobrante" : "Pago registrado",
    cuerpo:
      `${alumno.nombre || "Una alumna"} pagó ${montoTexto(Math.round(montoRecibido), moneda)} por WhatsApp. ${detalle}.` +
      (restante > 0
        ? ` Sobraron ${montoTexto(restante, moneda)} sin imputar: revisalo.`
        : ""),
    url: "/panel/finanzas",
  });

  return { ok: true, clases: aplicadas, sobrante: restante };
}

// ============================================================
// Reagenda de clases (el alumno reagenda por chat)
// ============================================================

function fechaHum(iso: string): string {
  const [y, mo, d] = iso.split("-");
  return `${d}/${mo}/${y}`;
}

/** Minutos que faltan para que empiece una clase (fecha + hora de inicio),
 *  respecto de la hora actual de la academia. Negativo si ya empezó/pasó. */
function minutosHastaInicio(fecha: string, inicioMin: number, zona: string): number {
  const ahora = ahoraEn(zona);
  const diasDif = Math.round(
    (parseFecha(fecha).getTime() - parseFecha(ahora.fecha).getTime()) / 86400000,
  );
  return diasDif * 1440 + (inicioMin - ahora.minutos);
}

/** ¿Se pisan dos franjas horarias? */
function solapan(aIni: number, aDur: number, bIni: number, bDur: number): boolean {
  return aIni < bIni + bDur && bIni < aIni + aDur;
}

/** Valida un horario contra las reglas de la plataforma (lun-sáb, 8-21, 60/90/120 min).
 *  Devuelve un mensaje de error, o null si es válido. */
export async function validarSlot(
  orgId: string,
  fecha: string,
  inicioMin: number,
  duracionMin: number,
): Promise<string | null> {
  const org = await getOrganizacion(orgId);
  const reglas = reglasDe(org);
  if (!duracionValida(duracionMin, reglas)) return mensajeDuracionInvalida(reglas);
  const dow = parseFecha(fecha).getDay();
  const ventana = ventanaDeOrg(org, dow);
  if (!ventana) return `Ese día no hay clases; atendemos ${horariosEnPalabras(org)}.`;
  const sinClase = await motivoDiaSinClase(orgId, fecha);
  if (sinClase !== null) {
    return `Ese día no se dan clases${sinClase ? ` (${sinClase})` : ""}. Ofrecele otro día.`;
  }
  const ahora = ahoraEn(await zonaDe(orgId));
  if (fecha < ahora.fecha) return "Ese día ya pasó; elegí uno de hoy en adelante.";
  if (fecha === ahora.fecha && inicioMin <= ahora.minutos)
    return "Ese horario ya pasó por hoy.";
  if (inicioMin < ventana.apertura || inicioMin + duracionMin > ventana.cierre)
    return `Ese día atendemos de ${hhmm(ventana.apertura)} a ${hhmm(ventana.cierre)} h.`;
  return null;
}

const COLUMNAS_ALUMNO = "id, nombre, codigo_acceso, zona_horaria, telefono";

type FilaAlumno = {
  id: string;
  nombre: string;
  codigo_acceso: string | null;
  zona_horaria: string | null;
  telefono: string | null;
};

/**
 * Busca la fila de un alumno por su teléfono, en los dos formatos en que puede
 * estar guardado.
 *
 * Los alumnos que cargó la dirección a mano están con el número local
 * ("2991234567"), mientras que WhatsApp lo entrega completo
 * ("5492991234567"). Con una comparación exacta, el bot no reconocía a
 * ninguno de los alumnos viejos: les pedía registrarse otra vez y terminaba
 * creando un perfil duplicado.
 *
 * Primero se intenta la coincidencia exacta (es la de los perfiles que creó el
 * bot, que ya guarda el número completo); solo si no hay, se comparan todos los
 * teléfonos normalizados. Son pocos alumnos, así que sale barato.
 */
async function filaAlumnoPorTelefono(
  db: DbDeOrg,
  contacto: string,
): Promise<FilaAlumno | null> {
  const { data } = await db
    .from("alumnos")
    .select(COLUMNAS_ALUMNO)
    .eq("telefono", contacto)
    .limit(1);
  if (data?.[0]) return data[0] as FilaAlumno;

  const buscado = normalizarTelefono(contacto);
  if (buscado.length < 8) return null;
  const { data: todos } = await db
    .from("alumnos")
    .select(COLUMNAS_ALUMNO)
    .not("telefono", "is", null);
  const fila = ((todos ?? []) as FilaAlumno[]).find(
    (a) => normalizarTelefono(String(a.telefono ?? "")) === buscado,
  );
  return fila ?? null;
}

async function buscarAlumnoId(
  db: DbDeOrg,
  contacto: string,
): Promise<string | null> {
  const fila = await filaAlumnoPorTelefono(db, contacto);
  return fila ? String(fila.id) : null;
}

export type ClaseFuturaBot = {
  id: string;
  fecha: string;
  fechaHum: string;
  hora: string;
  duracionMin: number;
  tipo: string;
  integrantes: number;
  estadoPago: string;
};

/** Clases futuras del alumno (para que el bot sepa cuál reagendar). */
export async function misClasesFuturas(
  orgId: string,
  contacto: string,
): Promise<ClaseFuturaBot[]> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");

  const alumnoId = await buscarAlumnoId(db, contacto);
  if (!alumnoId) return [];

  const { data: links } = await db
    .from("clase_alumnos")
    .select("clase_id")
    .eq("alumno_id", alumnoId);
  const claseIds = (links ?? []).map((l) => l.clase_id);
  if (claseIds.length === 0) return [];

  const hoy = ahoraEn(await zonaDe(orgId)).fecha;
  const { data: clases } = await db
    .from("clases")
    .select("id, fecha, inicio_min, duracion, tipo")
    .in("id", claseIds)
    .gte("fecha", hoy)
    .order("fecha")
    .order("inicio_min");
  if (!clases || clases.length === 0) return [];

  const ids = clases.map((c) => c.id);
  const { data: todosLinks } = await db
    .from("clase_alumnos")
    .select("clase_id")
    .in("clase_id", ids);
  const countByClase = new Map<string, number>();
  for (const l of todosLinks ?? [])
    countByClase.set(l.clase_id, (countByClase.get(l.clase_id) ?? 0) + 1);

  const { data: pagos } = await db
    .from("pagos")
    .select("clase_id, estado")
    .eq("alumno_id", alumnoId)
    .in("clase_id", ids);
  const estadoByClase = new Map<string, string>();
  for (const p of pagos ?? []) estadoByClase.set(p.clase_id, p.estado);

  return clases.map((c) => ({
    id: c.id,
    fecha: c.fecha,
    fechaHum: fechaHum(c.fecha),
    hora: hhmm(c.inicio_min),
    duracionMin: c.duracion,
    tipo: c.tipo,
    integrantes: countByClase.get(c.id) ?? 1,
    estadoPago: estadoByClase.get(c.id) ?? "SIN_PAGAR",
  }));
}

export type Disponibilidad =
  | { ok: true; dia: string; horarios: string[] }
  | { ok: false; motivo: string };

/** Horarios de inicio libres para un día y duración, según las reglas de la
 *  plataforma (lun-sáb, 8-21). Se ofrecen por hora y se sacan los que se pisan
 *  con otras clases que el alumno ya tenga ese día. */
export async function horariosDisponibles(
  orgId: string,
  contacto: string,
  fecha: string,
  duracionMin: number,
): Promise<Disponibilidad> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");

  const org = await getOrganizacion(orgId);
  const reglas = reglasDe(org);
  if (!duracionValida(duracionMin, reglas))
    return { ok: false, motivo: mensajeDuracionInvalida(reglas) };
  const dow = parseFecha(fecha).getDay();
  const ventana = ventanaDeOrg(org, dow);
  if (!ventana)
    return { ok: false, motivo: `Ese día no hay clases; atendemos ${horariosEnPalabras(org)}.` };
  const sinClase = await motivoDiaSinClase(orgId, fecha);
  if (sinClase !== null)
    return {
      ok: false,
      motivo: `Ese día no se dan clases${sinClase ? ` (${sinClase})` : ""}. Ofrecele otro día.`,
    };
  const ahora = ahoraEn(await zonaDe(orgId));
  if (fecha < ahora.fecha) return { ok: false, motivo: "Ese día ya pasó." };

  const candidatos: number[] = [];
  for (let t = ventana.apertura; t + duracionMin <= ventana.cierre; t += 60) {
    if (fecha === ahora.fecha && t <= ahora.minutos) continue;
    candidatos.push(t);
  }

  // Ocupación REAL de ese día: TODAS las clases ya agendadas en la plataforma
  // (de cualquier alumno). Un horario está libre solo si no se pisa con ninguna,
  // para que no se superpongan clases.
  const { data: clasesDelDia } = await db
    .from("clases")
    .select("inicio_min, duracion")
    .eq("fecha", fecha);
  const ocupados = (clasesDelDia ?? []) as {
    inicio_min: number;
    duracion: number;
  }[];

  const libres = candidatos.filter(
    (t) => !ocupados.some((o) => solapan(t, duracionMin, o.inicio_min, o.duracion)),
  );
  return { ok: true, dia: fechaHum(fecha), horarios: libres.map(hhmm) };
}

export type ResultadoReagenda =
  | {
      ok: true;
      clase: { fechaHum: string; hora: string; tipo: string };
      estadoPago: string;
      /** true si reagendó con menos de 3 hs (menos la tolerancia) y perdió la seña. */
      senaPerdida: boolean;
    }
  | {
      ok: false;
      motivo:
        | "sin_perfil"
        | "clase_no_encontrada"
        | "grupal_requiere_coordinacion"
        | "slot_invalido"
        | "solapa";
      detalle?: string;
      integrantes?: number;
    };

/** Reagenda una clase INDIVIDUAL del alumno: borra la vieja y crea la nueva en
 *  el nuevo día/horario, manteniendo el estado de la seña. La clase a mover se
 *  ubica por su día y hora ACTUALES (lo que el bot ya conoce de la conversación),
 *  para no depender de un id interno. Si la clase es GRUPAL con más de un
 *  integrante, NO la toca: avisa que necesita coordinar con todos. */
export async function reagendarClase(
  orgId: string,
  contacto: string,
  fechaActual: string,
  inicioMinActual: number,
  nuevaFecha: string,
  nuevoInicioMin: number,
  nuevaDuracionMin?: number,
): Promise<ResultadoReagenda> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");

  const alumnoId = await buscarAlumnoId(db, contacto);
  if (!alumnoId) return { ok: false, motivo: "sin_perfil" };

  // Ubicar la clase del alumno en su día y hora actuales.
  const { data: links0 } = await db
    .from("clase_alumnos")
    .select("clase_id")
    .eq("alumno_id", alumnoId);
  const misIds = (links0 ?? []).map((l) => l.clase_id);
  if (misIds.length === 0) return { ok: false, motivo: "clase_no_encontrada" };

  const { data: candidatas } = await db
    .from("clases")
    .select("id, tipo, fecha, inicio_min, duracion")
    .in("id", misIds)
    .eq("fecha", fechaActual)
    .eq("inicio_min", inicioMinActual);
  const clase = candidatas?.[0];
  if (!clase) return { ok: false, motivo: "clase_no_encontrada" };
  const claseId = clase.id;

  const { data: miembros } = await db
    .from("clase_alumnos")
    .select("alumno_id")
    .eq("clase_id", claseId);
  const cantidad = (miembros ?? []).length;
  if (clase.tipo === "GRUPAL" && cantidad >= 2)
    return { ok: false, motivo: "grupal_requiere_coordinacion", integrantes: cantidad };

  // Si no dicen otra duración, se mantiene la de la clase original.
  const duracionMin = nuevaDuracionMin ?? clase.duracion;

  const err = await validarSlot(orgId, nuevaFecha, nuevoInicioMin, duracionMin);
  if (err) return { ok: false, motivo: "slot_invalido", detalle: err };

  // No superponer clases: el nuevo horario no puede pisar NINGUNA otra clase ya
  // agendada ese día (de cualquier alumno), salvo la que estamos moviendo.
  const { data: clasesDelDia } = await db
    .from("clases")
    .select("id, inicio_min, duracion")
    .eq("fecha", nuevaFecha);
  for (const o of clasesDelDia ?? []) {
    if (o.id === claseId) continue;
    if (solapan(nuevoInicioMin, duracionMin, o.inicio_min, o.duracion))
      return { ok: false, motivo: "solapa" };
  }

  // Regla de anticipación de la academia (en esta, 3 h con 15 min de
  // tolerancia): si avisa más tarde, se reagenda igual pero NO se le reconoce
  // la seña.
  const faltan = minutosHastaInicio(fechaActual, inicioMinActual, await zonaDe(orgId));
  const senaPerdida = faltan < anticipacionReagenda(await getOrganizacion(orgId));

  // La seña ya pagada se conserva al reagendar (salvo que pierda la seña por avisar tarde).
  const { data: pagoViejo } = await db
    .from("pagos")
    .select("estado, monto")
    .eq("clase_id", claseId)
    .eq("alumno_id", alumnoId)
    .maybeSingle();
  const estado = senaPerdida ? "SIN_PAGAR" : (pagoViejo?.estado ?? "SIN_PAGAR");
  const monto = senaPerdida ? null : (pagoViejo?.monto ?? null);

  // Borrar la vieja (cascade limpia clase_alumnos + pagos) y crear la nueva.
  await db.from("clases").delete().eq("id", claseId);
  const nuevoId = `c-${Date.now()}`;
  await db.from("clases").insert({
    id: nuevoId,
    tipo: clase.tipo,
    tema_id: null,
    fecha: nuevaFecha,
    inicio_min: nuevoInicioMin,
    duracion: duracionMin,
    profe_id: null,
  });
  await db.from("clase_alumnos").insert({ clase_id: nuevoId, alumno_id: alumnoId });
  await db.from("pagos").insert({
    id: `p-${Date.now()}`,
    clase_id: nuevoId,
    alumno_id: alumnoId,
    estado,
    monto,
    fecha: estado === "SIN_PAGAR" ? null : ahoraEn(await zonaDe(orgId)).fecha,
  });

  // Avisar al profe: la agenda del día nuevo (y del viejo, si cambió de día).
  await avisarProfeDeCambio(orgId, nuevaFecha, null);
  if (fechaActual !== nuevaFecha) await avisarProfeDeCambio(orgId, fechaActual, null);

  const { data: quien } = await db
    .from("alumnos")
    .select("nombre")
    .eq("id", alumnoId)
    .maybeSingle();
  await notificarAdmins(orgId, {
    titulo: "Clase reagendada por WhatsApp",
    cuerpo: `${quien?.nombre ?? "Una alumna"} movió su clase del ${fechaHum(fechaActual)} ${hhmm(inicioMinActual)} al ${fechaHum(nuevaFecha)} ${hhmm(nuevoInicioMin)}.${senaPerdida ? " Avisó tarde, así que perdió la seña." : ""}`,
    url: "/panel/agenda",
  });

  return {
    ok: true,
    clase: { fechaHum: fechaHum(nuevaFecha), hora: hhmm(nuevoInicioMin), tipo: clase.tipo },
    estadoPago: estado,
    senaPerdida,
  };
}

// ============================================================
// Reagenda GRUPAL — motor de reparto y recotización
// ------------------------------------------------------------
// Dada la decisión de cada integrante (quedarse en el horario original o
// moverse a otro), reparte a los alumnos en clases nuevas/editadas y recotiza
// según cuántos quedan en cada una (1 = individual, 2 = grupal de 2, 3+ = de 3).
//
// La lógica de reparto/recotización vive acá y es la parte crítica (toca plata).
// La coordinación previa —que el bot le escriba a CADA integrante para saber qué
// quiere— necesita WhatsApp conectado y se arma en la fase de WhatsApp; una vez
// que se tienen las respuestas de todos, se llama a esta función.
// ============================================================

export type DecisionMiembro =
  | { alumnoId: string; accion: "quedarse" }
  | {
      alumnoId: string;
      accion: "mover";
      fecha: string;
      inicioMin: number;
      duracionMin: number;
      /** Los que compartan `grupo` se reagendan juntos en la misma clase. */
      grupo?: string;
    };

export type ClaseResultante = {
  claseId: string;
  tipo: string;
  fechaHum: string;
  hora: string;
  integrantes: string[];
  precioPorAlumno: number;
};

export type ResultadoReagendaGrupal =
  | { ok: true; clases: ClaseResultante[] }
  | { ok: false; motivo: string };

export async function resolverReagendaGrupal(
  orgId: string,
  claseId: string,
  decisiones: DecisionMiembro[],
): Promise<ResultadoReagendaGrupal> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");

  const { data: clase } = await db
    .from("clases")
    .select("id, fecha, inicio_min, duracion, tipo")
    .eq("id", claseId)
    .maybeSingle();
  if (!clase) return { ok: false, motivo: "No encontré la clase grupal." };

  const { data: miembros } = await db
    .from("clase_alumnos")
    .select("alumno_id")
    .eq("clase_id", claseId);
  const miembroIds = (miembros ?? []).map((m) => m.alumno_id);

  const { data: pagos } = await db
    .from("pagos")
    .select("alumno_id, estado, monto")
    .eq("clase_id", claseId)
    .in("alumno_id", miembroIds);
  const pagoByAlumno = new Map<string, { estado: string; monto: number | null }>();
  for (const p of pagos ?? [])
    pagoByAlumno.set(p.alumno_id, { estado: p.estado, monto: p.monto });

  const { data: alumnosData } = await db
    .from("alumnos")
    .select("id, nombre")
    .in("id", miembroIds);
  const nombreById = new Map<string, string>();
  for (const a of alumnosData ?? []) nombreById.set(a.id, a.nombre);

  const { data: precios } = await db
    .from("precios")
    .select("valor_individual, valor_grupal_2, valor_grupal_3")
    .maybeSingle();
  // El precio se recotiza por tamaño del grupo Y por duración: los valores
  // cargados son POR HORA, así que una clase de 2 h vale el doble.
  const precioPara = (
    tipo: string,
    count: number,
    duracionMin: number,
  ): number =>
    precioAlumno(
      {
        valorIndividual: Number(precios?.valor_individual ?? 0),
        valorGrupal2: Number(precios?.valor_grupal_2 ?? 0),
        valorGrupal3: Number(precios?.valor_grupal_3 ?? 0),
      },
      tipo === "GRUPAL" ? "GRUPAL" : "INDIVIDUAL",
      count,
      duracionMin,
    );

  const stayers = decisiones
    .filter((d) => d.accion === "quedarse")
    .map((d) => d.alumnoId)
    .filter((id) => miembroIds.includes(id));

  const movers = decisiones.filter(
    (d): d is Extract<DecisionMiembro, { accion: "mover" }> =>
      d.accion === "mover" && miembroIds.includes(d.alumnoId),
  );

  // Agrupar a los que se mueven: por `grupo`, o por franja idéntica.
  const grupos = new Map<
    string,
    { fecha: string; inicioMin: number; duracionMin: number; ids: string[] }
  >();
  for (const m of movers) {
    const key = m.grupo ?? `${m.fecha}|${m.inicioMin}|${m.duracionMin}`;
    const g =
      grupos.get(key) ??
      { fecha: m.fecha, inicioMin: m.inicioMin, duracionMin: m.duracionMin, ids: [] };
    g.ids.push(m.alumnoId);
    grupos.set(key, g);
  }

  for (const g of grupos.values()) {
    const err = await validarSlot(orgId, g.fecha, g.inicioMin, g.duracionMin);
    if (err) return { ok: false, motivo: `Horario inválido para reagendar: ${err}` };
  }

  const resultado: ClaseResultante[] = [];

  // Nuevas clases para los que se mueven; se los saca de la clase original.
  for (const g of grupos.values()) {
    const tipo = g.ids.length >= 2 ? "GRUPAL" : "INDIVIDUAL";
    const nuevoId = `c-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await db.from("clases").insert({
      id: nuevoId,
      tipo,
      tema_id: null,
      fecha: g.fecha,
      inicio_min: g.inicioMin,
      duracion: g.duracionMin,
      profe_id: null,
    });
    for (const id of g.ids) {
      await db.from("clase_alumnos").insert({ clase_id: nuevoId, alumno_id: id });
      const pago = pagoByAlumno.get(id) ?? { estado: "SIN_PAGAR", monto: null };
      await db.from("pagos").insert({
        id: `p-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        clase_id: nuevoId,
        alumno_id: id,
        estado: pago.estado,
        monto: pago.monto,
        fecha: pago.estado === "SIN_PAGAR" ? null : ahoraEn(await zonaDe(orgId)).fecha,
      });
      await db.from("pagos").delete().eq("clase_id", claseId).eq("alumno_id", id);
      await db
        .from("clase_alumnos")
        .delete()
        .eq("clase_id", claseId)
        .eq("alumno_id", id);
    }
    resultado.push({
      claseId: nuevoId,
      tipo,
      fechaHum: fechaHum(g.fecha),
      hora: hhmm(g.inicioMin),
      integrantes: g.ids.map((id) => nombreById.get(id) ?? id),
      precioPorAlumno: precioPara(tipo, g.ids.length, g.duracionMin),
    });
  }

  // Clase original: los que se quedan. Si no queda nadie, se borra; si queda uno
  // solo, pasa a INDIVIDUAL (y recotiza como individual).
  if (stayers.length === 0) {
    await db.from("clases").delete().eq("id", claseId);
  } else {
    const tipo = stayers.length >= 2 ? "GRUPAL" : "INDIVIDUAL";
    await db.from("clases").update({ tipo }).eq("id", claseId);
    resultado.push({
      claseId,
      tipo,
      fechaHum: fechaHum(clase.fecha),
      hora: hhmm(clase.inicio_min),
      integrantes: stayers.map((id) => nombreById.get(id) ?? id),
      precioPorAlumno: precioPara(tipo, stayers.length, clase.duracion),
    });
  }

  return { ok: true, clases: resultado };
}

// ============================================================
// Agendar una clase NUEVA desde el chat (el bot le anota la clase al alumno)
// ============================================================

/** Normaliza un nombre para comparar: sin acentos, sin mayúsculas, sin espacios
 *  de más. Así "Tomás Peralta" y "tomas peralta" son el mismo. */
function normalizarNombre(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export type ResultadoAgendar =
  | {
      ok: true;
      /** La misma clase de este alumno ya existía: no se creó otra. */
      yaEstaba?: boolean;
      clase: { fechaHum: string; hora: string; tipo: string };
      /** Cuántos alumnos quedaron en la clase (para saber el precio). */
      integrantes: number;
      /** Nombres de los compañeros que se pudieron sumar. */
      agregados: string[];
    }
  | {
      ok: false;
      motivo:
        | "sin_perfil"
        | "slot_invalido"
        | "solapa"
        | "companeros_sin_identificar";
      detalle?: string;
      /** Solo en 'companeros_sin_identificar': los nombres que no se resolvieron. */
      noEncontrados?: string[];
    };

/**
 * Agenda una clase nueva para el alumno del contacto. Si es GRUPAL y le pasan
 * nombres de compañeros, los suma a la misma clase (solo si ya están dados de
 * alta y el nombre identifica a UNO solo). Si algún nombre no se puede
 * identificar, NO agenda nada y los devuelve para que el bot pida el nombre
 * completo: una grupal incompleta tendría el precio equivocado.
 *
 * La clase se crea SIN profe ni tema (los asigna el admin), y con la seña
 * pendiente (SIN_PAGAR), igual que cuando el alumno agenda desde la web.
 */
export async function agendarClaseBot(
  orgId: string,
  contacto: string,
  tipo: "INDIVIDUAL" | "GRUPAL",
  fecha: string,
  inicioMin: number,
  duracionMin: number,
  companeros?: string[],
): Promise<ResultadoAgendar> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");

  const alumnoId = await buscarAlumnoId(db, contacto);
  if (!alumnoId) return { ok: false, motivo: "sin_perfil" };

  const err = await validarSlot(orgId, fecha, inicioMin, duracionMin);
  if (err) return { ok: false, motivo: "slot_invalido", detalle: err };

  // No superponer con ninguna otra clase ya agendada ese día.
  const { data: clasesDelDia } = await db
    .from("clases")
    .select("id, tipo, inicio_min, duracion")
    .eq("fecha", fecha);
  for (const o of clasesDelDia ?? []) {
    if (!solapan(inicioMin, duracionMin, o.inicio_min, o.duracion)) continue;
    // Si la que choca es la misma clase de este alumno, no es un choque: ya
    // estaba agendada (el bot a veces reintenta una reserva que ya hizo).
    if (o.inicio_min === inicioMin) {
      const { data: suya } = await db
        .from("clase_alumnos")
        .select("clase_id")
        .eq("clase_id", o.id)
        .eq("alumno_id", alumnoId)
        .maybeSingle();
      if (suya) {
        const { count } = await db
          .from("clase_alumnos")
          .select("alumno_id", { count: "exact", head: true })
          .eq("clase_id", o.id);
        return {
          ok: true,
          yaEstaba: true,
          clase: { fechaHum: fechaHum(fecha), hora: hhmm(inicioMin), tipo: o.tipo },
          integrantes: count ?? 1,
          agregados: [],
        };
      }
    }
    return { ok: false, motivo: "solapa" };
  }

  // Buscar a los compañeros por nombre (solo si es grupal). La comparación
  // ignora acentos y mayúsculas: el bot suele escribir "Tomás" y en la base
  // puede estar "Tomas" (o al revés).
  const agregadosIds: string[] = [];
  const agregados: string[] = [];
  const noEncontrados: string[] = [];
  if (tipo === "GRUPAL" && companeros?.length) {
    const { data: padron } = await db.from("alumnos").select("id, nombre");
    const lista = (padron ?? []) as { id: string; nombre: string }[];
    for (const nombreBuscado of companeros) {
      const q = normalizarNombre(nombreBuscado);
      if (!q) continue;
      const matches = lista.filter(
        (a) => a.id !== alumnoId && normalizarNombre(a.nombre).includes(q),
      );
      // Solo lo sumo si el nombre identifica a UNO solo (sin ambigüedad).
      if (matches.length === 1) {
        if (!agregadosIds.includes(matches[0].id)) {
          agregadosIds.push(matches[0].id);
          agregados.push(matches[0].nombre);
        }
      } else {
        noEncontrados.push(nombreBuscado.trim());
      }
    }
  }

  // Si algún compañero no se pudo identificar, NO agendamos nada: el precio de
  // la grupal depende de cuántos son, así que crearla incompleta saldría mal.
  // Que el bot pregunte el nombre completo y vuelva a intentar de cero.
  if (noEncontrados.length)
    return { ok: false, motivo: "companeros_sin_identificar", noEncontrados };

  const claseId = `c-${Date.now()}`;
  await db.from("clases").insert({
    id: claseId,
    tipo,
    tema_id: null,
    fecha,
    inicio_min: inicioMin,
    duracion: duracionMin,
    profe_id: null,
  });

  const todos = [alumnoId, ...agregadosIds];
  await db
    .from("clase_alumnos")
    .insert(todos.map((id) => ({ clase_id: claseId, alumno_id: id })));
  await db.from("pagos").insert(
    todos.map((id, i) => ({
      id: `p-${Date.now()}-${i}`,
      clase_id: claseId,
      alumno_id: id,
      estado: "SIN_PAGAR",
    })),
  );

  await avisarProfeDeCambio(orgId, fecha, null);

  return {
    ok: true,
    clase: { fechaHum: fechaHum(fecha), hora: hhmm(inicioMin), tipo },
    integrantes: todos.length,
    agregados,
  };
}
