// Utilidades de fecha que trabajan con strings "YYYY-MM-DD" en horario local
// (sin sorpresas de zona horaria). Seguras para servidor y cliente.

export function parseFecha(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function aISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * "Hoy" en la zona horaria de la academia (organizaciones.zona_horaria).
 *
 * OJO: no se puede usar `aISO(new Date())`. El servidor de Vercel corre en UTC
 * y Argentina va 3 horas atrás, así que a partir de las 21:00 de acá el
 * servidor ya cree que es el día siguiente. Como se dan clases hasta las 22:00,
 * todas las noches había una ventana de 3 horas en la que la plataforma se
 * equivocaba de día: la agenda abría en mañana, las clases de hoy dejaban de
 * figurar como próximas y aparecían en "Falta cobrar" antes de darse.
 *
 * La zona es obligatoria a propósito: cada academia tiene la suya.
 */
export function hoyEn(zona: string): string {
  return ahoraEn(zona).fecha;
}

export function sumarDias(iso: string, n: number): string {
  const d = parseFecha(iso);
  d.setDate(d.getDate() + n);
  return aISO(d);
}

/** Lunes de la semana que contiene a la fecha dada. */
export function lunesDeLaSemana(iso: string): string {
  const d = parseFecha(iso);
  const dow = (d.getDay() + 6) % 7; // 0 = lunes … 6 = domingo
  d.setDate(d.getDate() - dow);
  return aISO(d);
}

/** Días de la semana (lunes a sábado) que contiene a la fecha. */
export function diasDeSemana(iso: string): string[] {
  const lun = lunesDeLaSemana(iso);
  return Array.from({ length: 6 }, (_, i) => sumarDias(lun, i));
}

export function nombreDiaCorto(iso: string): string {
  return parseFecha(iso).toLocaleDateString("es-AR", { weekday: "short" });
}

export function nombreDiaLargo(iso: string): string {
  return parseFecha(iso).toLocaleDateString("es-AR", { weekday: "long" });
}

export function diaNumero(iso: string): number {
  return parseFecha(iso).getDate();
}

export function fechaLargaES(iso: string): string {
  return parseFecha(iso).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "AAAA-MM" del mes en curso en la zona de la academia. (Antes salía de la
 *  hora del servidor, en UTC: el último día del mes a la noche ya era el mes
 *  siguiente.) */
export function mesActualEn(zona: string): string {
  return hoyEn(zona).slice(0, 7);
}

export function nombreMesAnio(anioMes: string): string {
  const [y, m] = anioMes.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
}

export function sumarMes(anioMes: string, n: number): string {
  const [y, m] = anioMes.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Fecha y hora ACTUAL en la zona de la academia (el server de Vercel corre
 *  en UTC, por eso se calcula con la zona horaria explícita). minutos = desde
 *  medianoche. */
export function ahoraEn(zona: string): { fecha: string; minutos: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date())) p[part.type] = part.value;
  let hora = parseInt(p.hour, 10);
  if (hora === 24) hora = 0; // algunos entornos devuelven "24" a medianoche
  return {
    fecha: `${p.year}-${p.month}-${p.day}`,
    minutos: hora * 60 + parseInt(p.minute, 10),
  };
}

/** ¿La clase se está dando ahora mismo? (misma fecha y hora dentro del rango). */
export function estaEnVivo(
  fecha: string,
  inicioMin: number,
  duracion: number,
  zona: string,
): boolean {
  const { fecha: hoy, minutos } = ahoraEn(zona);
  return fecha === hoy && minutos >= inicioMin && minutos < inicioMin + duracion;
}

/** Etiqueta del rango de una semana, ej: "2 – 7 jun" o "30 may – 4 jun". */
export function rangoSemanaLabel(iso: string): string {
  const dias = diasDeSemana(iso);
  const a = parseFecha(dias[0]);
  const b = parseFecha(dias[5]);
  const mesA = a.toLocaleDateString("es-AR", { month: "short" });
  const mesB = b.toLocaleDateString("es-AR", { month: "short" });
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()} – ${b.getDate()} ${mesB}`;
  }
  return `${a.getDate()} ${mesA} – ${b.getDate()} ${mesB}`;
}

/**
 * Zonas horarias.
 *
 * La hora REAL de una clase es la de la ACADEMIA (organizaciones.zona_horaria):
 * es la agenda del profe, y es lo que se guarda y lo que se usa para ver si
 * dos clases se pisan. Lo que cambia por alumno es cómo se le muestra: una
 * alumna en México ve "15:00" donde la academia, en Argentina, tiene las
 * 18:00. Nada de esto toca la base.
 */
export const ZONA_ARGENTINA = "America/Argentina/Cordoba";

/** Las de los países desde donde se toman clases. Se eligen en la ficha. */
export const ZONAS_HORARIAS: { zona: string; etiqueta: string }[] = [
  { zona: ZONA_ARGENTINA, etiqueta: "Argentina" },
  { zona: "America/Mexico_City", etiqueta: "México (centro)" },
  { zona: "America/Tijuana", etiqueta: "México (Tijuana)" },
  { zona: "America/Santiago", etiqueta: "Chile" },
  { zona: "America/Montevideo", etiqueta: "Uruguay" },
  { zona: "America/Asuncion", etiqueta: "Paraguay" },
  { zona: "America/La_Paz", etiqueta: "Bolivia" },
  { zona: "America/Lima", etiqueta: "Perú" },
  { zona: "America/Bogota", etiqueta: "Colombia" },
  { zona: "America/Caracas", etiqueta: "Venezuela" },
  { zona: "America/Guayaquil", etiqueta: "Ecuador" },
  { zona: "America/Sao_Paulo", etiqueta: "Brasil (San Pablo)" },
  { zona: "Europe/Madrid", etiqueta: "España" },
  { zona: "America/New_York", etiqueta: "Estados Unidos (este)" },
];

export function etiquetaDeZona(zona: string): string {
  return ZONAS_HORARIAS.find((z) => z.zona === zona)?.etiqueta ?? zona;
}

/**
 * Código de país → zona horaria. `varias` marca los países con más de un huso,
 * donde el prefijo solo alcanza para saber el país: se elige el huso más
 * poblado y hay que confirmarlo con el alumno.
 */
const PREFIJOS: { codigo: string; zona: string; varias?: boolean }[] = [
  // Tres dígitos primero: el código más largo gana (591 antes que 59…).
  { codigo: "591", zona: "America/La_Paz" },
  { codigo: "593", zona: "America/Guayaquil" },
  { codigo: "595", zona: "America/Asuncion" },
  { codigo: "598", zona: "America/Montevideo" },
  { codigo: "34", zona: "Europe/Madrid" },
  { codigo: "51", zona: "America/Lima" },
  { codigo: "52", zona: "America/Mexico_City", varias: true },
  { codigo: "54", zona: ZONA_ARGENTINA },
  { codigo: "55", zona: "America/Sao_Paulo", varias: true },
  { codigo: "56", zona: "America/Santiago" },
  { codigo: "57", zona: "America/Bogota" },
  { codigo: "58", zona: "America/Caracas" },
  { codigo: "1", zona: "America/New_York", varias: true },
];

/** Cuántos dígitos tiene un número internacional completo, como mínimo. */
const DIGITOS_CON_PAIS = 11;

export interface ZonaDeducida {
  zona: string;
  etiqueta: string;
  /** El país tiene varios husos: es una conjetura, hay que confirmarla. */
  dudosa: boolean;
}

/**
 * Deduce la zona horaria a partir del prefijo del teléfono.
 *
 * Es una SUGERENCIA, no un dato: el prefijo dice dónde se dio de alta la línea,
 * no dónde vive la persona (alguien que se mudó conserva su número). Siempre se
 * puede corregir a mano en la ficha del alumno.
 *
 * Devuelve null —y entonces se asume Argentina— en dos casos:
 *
 *  - El número no trae código de país. Los alumnos cargados a mano están
 *    guardados así ("2604096105"), y adivinar el país sobre esos números sería
 *    inventar: un número de Buenos Aires empieza con 11 y se leería como
 *    Estados Unidos.
 *  - El prefijo no está en la lista, o es argentino (que ya es el valor por
 *    defecto y no hace falta guardar).
 */
export function zonaDeTelefono(
  telefono: string | null | undefined,
  zonaAcademia: string,
): ZonaDeducida | null {
  if (!telefono) return null;
  // "+54 9 260…", "0054260…" y "54 9 260…" son el mismo número.
  const digitos = String(telefono).replace(/\D/g, "").replace(/^00/, "");
  if (digitos.length < DIGITOS_CON_PAIS || digitos.length > 15) return null;

  for (const p of PREFIJOS) {
    if (!digitos.startsWith(p.codigo)) continue;
    // Estados Unidos y Canadá son "1" + 10 dígitos, nada más. Sin este corte,
    // un número argentino sin código de país se leería como norteamericano.
    if (p.codigo === "1" && digitos.length !== 11) return null;
    // La misma zona que la academia ya es el valor por defecto.
    if (p.zona === zonaAcademia) return null;
    return { zona: p.zona, etiqueta: etiquetaDeZona(p.zona), dudosa: Boolean(p.varias) };
  }
  return null;
}

/** Cuántos minutos está la zona adelante de UTC en ese instante (Argentina:
 *  -180). Contempla el horario de verano de cada país. */
function desfaseMin(zona: string, instante: Date): number {
  const p: Record<string, string> = {};
  for (const parte of new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instante)) {
    p[parte.type] = parte.value;
  }
  const hora = p.hour === "24" ? 0 : Number(p.hour);
  const comoUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hora, Number(p.minute));
  return Math.round((comoUtc - instante.getTime()) / 60000);
}

/** El momento exacto (UTC) de una clase, a partir de su día y su hora en la
 *  zona de la academia. (Antes asumía Argentina, UTC-3 fijo: con una academia
 *  en un país con horario de verano, la conversión se corría una hora.) */
function instanteEn(fechaISO: string, inicioMin: number, zona: string): Date {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d, 0, inicioMin);
  // Dos pasadas: la segunda corrige si justo ese día cambia el horario.
  let t = base - desfaseMin(zona, new Date(base)) * 60000;
  t = base - desfaseMin(zona, new Date(t)) * 60000;
  return new Date(t);
}

/**
 * La misma clase, vista desde la zona del alumno: su día y su hora.
 * Para una clase del martes 18:00 en Argentina, una alumna en México ve
 * martes 15:00; en España, miércoles 23:00 (puede cambiar el día).
 */
export function enZonaDelAlumno(
  fechaISO: string,
  inicioMin: number,
  zona: string,
  zonaAcademia: string,
): { fecha: string; hora: string; minutos: number; cambiaDeDia: boolean } {
  const instante = instanteEn(fechaISO, inicioMin, zonaAcademia);
  const partes = new Intl.DateTimeFormat("es-AR", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instante);
  const val = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "00";
  const fecha = `${val("year")}-${val("month")}-${val("day")}`;
  const hora = `${val("hour") === "24" ? "00" : val("hour")}:${val("minute")}`;
  const [h, mi] = hora.split(":").map(Number);
  return { fecha, hora, minutos: h * 60 + mi, cambiaDeDia: fecha !== fechaISO };
}

/** "18:00 de Argentina (15:00 en México)" — si el alumno está en otra zona
 *  que la academia. */
export function horaParaAlumno(
  fechaISO: string,
  inicioMin: number,
  zona: string | null | undefined,
  zonaAcademia: string,
): string {
  const hhmm = `${String(Math.floor(inicioMin / 60)).padStart(2, "0")}:${String(
    inicioMin % 60,
  ).padStart(2, "0")}`;
  if (!zona || zona === zonaAcademia) return hhmm;
  const suya = enZonaDelAlumno(fechaISO, inicioMin, zona, zonaAcademia);
  const dia = suya.cambiaDeDia ? ` del ${suya.fecha.split("-").reverse().slice(0, 2).join("/")}` : "";
  return `${hhmm} de ${etiquetaDeZona(zonaAcademia)} (${suya.hora}${dia} en ${etiquetaDeZona(zona)})`;
}
