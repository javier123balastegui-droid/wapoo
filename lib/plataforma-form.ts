import type { DatosEditables, Franja } from "@/lib/plataforma";
import { PAISES } from "@/lib/paises";

// Lectura del formulario de una academia (alta y edición). Aparte de las
// acciones para poder probarla con scripts.

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();

/** "14:30" → 870. null si no es una hora válida. */
function minutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const total = Number(m[1]) * 60 + Number(m[2]);
  return total >= 0 && total <= 24 * 60 ? total : null;
}

/**
 * Lee y valida los datos editables de una academia (los mismos campos en el
 * alta y en la edición). Devuelve los errores por campo para el formulario.
 */
export function leerDatosEditables(fd: FormData): { datos: DatosEditables; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const nombre = texto(fd, "nombre");
  const materia = texto(fd, "materia");
  if (!nombre) errors.nombre = "Ingresá el nombre de la academia.";
  if (!materia) errors.materia = "Ingresá la materia.";

  // Horarios: un renglón por día, de domingo (0) a sábado (6).
  const horarios: (Franja | null)[] = [];
  for (let dow = 0; dow < 7; dow++) {
    if (fd.get(`dia-${dow}-abierto`) !== "on") {
      horarios.push(null);
      continue;
    }
    const apertura = minutos(texto(fd, `dia-${dow}-desde`));
    const cierre = minutos(texto(fd, `dia-${dow}-hasta`));
    if (apertura === null || cierre === null || apertura >= cierre) {
      errors.horarios = "Revisá los horarios: cada día abierto necesita un desde y un hasta, y el desde tiene que ser antes.";
      horarios.push(null);
    } else {
      horarios.push({ apertura, cierre });
    }
  }
  if (!horarios.some(Boolean) && !errors.horarios) errors.horarios = "Marcá al menos un día con clases.";

  const horas = Number(texto(fd, "reagendaHoras").replace(",", "."));
  const tolerancia = Number(texto(fd, "reagendaTolerancia"));
  if (!Number.isFinite(horas) || horas < 0 || horas > 168) {
    errors.reagenda = "La anticipación va en horas, entre 0 y 168 (una semana).";
  } else if (!Number.isInteger(tolerancia) || tolerancia < 0 || tolerancia > horas * 60) {
    errors.reagenda = "La tolerancia va en minutos, y no puede ser mayor que la anticipación.";
  }

  const duracionMinima = Number(texto(fd, "duracionMinima"));
  const pasoDuracion = Number(texto(fd, "pasoDuracion"));
  if (!Number.isInteger(duracionMinima) || duracionMinima < 15 || duracionMinima > 600) {
    errors.duracion = "La duración mínima va en minutos, entre 15 y 600.";
  } else if (!Number.isInteger(pasoDuracion) || pasoDuracion < 5 || pasoDuracion > 240) {
    errors.duracion = "El paso va en minutos, entre 5 y 240.";
  }

  // País: moneda, números y zona horaria. "actual" = dejar lo que tenía
  // (una combinación cargada a mano que no está en la lista).
  const idPais = texto(fd, "pais");
  const pais = PAISES.find((p) => p.id === idPais);
  const actual = {
    moneda: texto(fd, "monedaActual"),
    locale: texto(fd, "localeActual"),
    zonaHoraria: texto(fd, "zonaActual"),
  };
  if (!pais && !(idPais === "actual" && actual.moneda && actual.locale && actual.zonaHoraria)) {
    errors.pais = "Elegí el país de la academia.";
  }
  const region = pais
    ? { moneda: pais.moneda, locale: pais.locale, zonaHoraria: pais.zona }
    : actual;

  return {
    datos: {
      nombre,
      materia,
      directora: texto(fd, "directora"),
      descripcion: texto(fd, "descripcion"),
      aliasPago: texto(fd, "aliasPago"),
      titularPago: texto(fd, "titularPago"),
      instagramUrl: texto(fd, "instagramUrl"),
      whatsappPublico: texto(fd, "whatsappPublico").replace(/\D/g, ""),
      horarios,
      reagendaAnticipacionMin: Math.round(horas * 60),
      reagendaToleranciaMin: tolerancia,
      duracionMinima,
      pasoDuracion,
      ...region,
    },
    errors,
  };
}

