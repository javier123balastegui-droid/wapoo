import type {
  EstadoPago,
  EstadoRealizacion,
  EstadoSolicitud,
  TipoClase,
  PreferenciaModalidad,
} from "./types";

// — Carreras (lista editable; estos son los valores iniciales) —
export const CARRERAS = [
  "Medicina",
  "Kinesiología",
  "Enfermería",
  "Odontología",
  "Fonoaudiología",
  "Nutrición",
  "Psicología",
  "Obstetricia",
  "Bioquímica",
  "Instrumentación quirúrgica",
  "Terapia ocupacional",
  "Profesorado de educación física",
] as const;

// — Estados de pago: etiqueta + estilo del badge + color del punto —
export const ESTADO_PAGO_META: Record<
  EstadoPago,
  { label: string; badge: string; dot: string }
> = {
  SIN_PAGAR: {
    label: "Sin seña",
    badge: "bg-pago-sin-bg text-pago-sin",
    dot: "bg-pago-sin",
  },
  SENADO: {
    label: "Señó",
    badge: "bg-pago-sena-bg text-pago-sena",
    dot: "bg-pago-sena",
  },
  PAGADO: {
    label: "Pagó completo",
    badge: "bg-pago-ok-bg text-pago-ok",
    dot: "bg-pago-ok",
  },
};

// — Estado de realización de la clase: etiqueta + estilo del chip + color del ícono —
export const ESTADO_REALIZACION_META: Record<
  EstadoRealizacion,
  { label: string; corto: string; badge: string; text: string }
> = {
  PENDIENTE: {
    label: "Sin marcar",
    corto: "Sin marcar",
    badge: "bg-beige/50 text-ink-soft",
    text: "text-ink-muted",
  },
  REALIZADA: {
    label: "Realizada con normalidad",
    corto: "Realizada",
    badge: "bg-pago-ok-bg text-pago-ok",
    text: "text-pago-ok",
  },
  REAGENDADA: {
    label: "Reagendada (avisó con tiempo)",
    corto: "Reagendada",
    badge: "bg-pago-sena-bg text-pago-sena",
    text: "text-pago-sena",
  },
  CANCELADA: {
    label: "Cancelada a último momento",
    corto: "Cancelada",
    badge: "bg-[#fbeaea] text-[#a85d5d]",
    text: "text-[#a85d5d]",
  },
  AUSENTE: {
    label: "No avisó / no se conectó",
    corto: "No se conectó",
    badge: "bg-pago-sin-bg text-pago-sin",
    text: "text-pago-sin",
  },
};

// — Tipo de clase —
export const TIPO_CLASE_META: Record<TipoClase, { label: string }> = {
  GRUPAL: { label: "Grupal" },
  INDIVIDUAL: { label: "Individual" },
};

// — Preferencia de modalidad (formulario público) —
export const PREFERENCIA_META: Record<PreferenciaModalidad, { label: string }> =
  {
    GRUPAL: { label: "Grupal" },
    INDIVIDUAL: { label: "Individual" },
    INDISTINTO: { label: "Indistinto" },
  };

// — Estados de solicitud de inscripción —
export const ESTADO_SOLICITUD_META: Record<
  EstadoSolicitud,
  { label: string; badge: string; dot: string }
> = {
  NUEVA: {
    label: "Nueva",
    badge: "bg-blush-soft text-blush-deep",
    dot: "bg-blush-deep",
  },
  CONTACTADA: {
    label: "Contactada",
    badge: "bg-pago-sena-bg text-pago-sena",
    dot: "bg-pago-sena",
  },
  CONVERTIDA: {
    label: "Convertida",
    badge: "bg-pago-ok-bg text-pago-ok",
    dot: "bg-pago-ok",
  },
  DESCARTADA: {
    label: "Descartada",
    badge: "bg-pago-sin-bg text-pago-sin",
    dot: "bg-pago-sin",
  },
};

// ============================================================
// Configuración de horarios (para el selector "abanico" — Fase 4)
// Las clases se dictan de lunes a sábado, con duración variable.
// ============================================================

/** Los días y horarios de atención, las duraciones de las clases y la franja
 *  del panel son de cada academia: están en la tabla organizaciones (ver
 *  reglasDe y ventanaDeOrg en lib/organizacion.ts, y lib/agenda-reglas.ts). */
