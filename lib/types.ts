// ============================================================
// Modelo de datos de la plataforma (tipos compartidos).
// Seguro de importar tanto en servidor como en cliente
// (no contiene datos ni lógica, solo definiciones).
// ============================================================

export type Rol = "ADMIN" | "PROFE";

export type TipoClase = "GRUPAL" | "INDIVIDUAL";

/** Duración de una clase, en minutos. */
/** En minutos. Cuáles valen depende de la academia (lib/agenda-reglas.ts). */
export type DuracionClase = number;

export type EstadoPago = "SIN_PAGAR" | "SENADO" | "PAGADO";

/** Estado de realización de la clase (lo marca el admin; los profes solo lo ven). */
export type EstadoRealizacion =
  | "PENDIENTE"
  | "REALIZADA"
  | "REAGENDADA"
  | "CANCELADA"
  | "AUSENTE";

export type EstadoSolicitud =
  | "NUEVA"
  | "CONTACTADA"
  | "CONVERTIDA"
  | "DESCARTADA";

export type PreferenciaModalidad = "GRUPAL" | "INDIVIDUAL" | "INDISTINTO";

// — Usuarios (solo admin y profes se loguean) —
export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  /** Un ADMIN puede además dar clases (aparece como profesor asignable). */
  esProfe?: boolean;
  /** WhatsApp del profe, para los avisos de clases agendadas/reagendadas. */
  telefono?: string;
  /** Solo para el login simulado de esta etapa; se reemplaza con Supabase Auth. */
  password?: string;
  activo: boolean;
  creadoEn: string;
}

/** Datos del usuario seguros para exponer (sin contraseña). */
export type SessionUser = Pick<Usuario, "id" | "nombre" | "email" | "rol"> & {
  /** Academia a la que pertenece. Todo lo que hace en el panel es de ella. */
  organizacionId: string;
};

// — Alumnos (NO se loguean; son solo un registro) —
export interface Alumno {
  id: string;
  nombre: string;
  carrera: string;
  email?: string;
  telefono?: string;
  notas?: string;
  /** Código personal con el que el alumno entra al portal (sin cuenta). */
  codigoAcceso?: string;
  /** Zona horaria del alumno (IANA). Vacío = Argentina. La hora real de la
   *  clase es siempre la de Argentina; esto es solo para mostrársela a él. */
  zonaHoraria?: string;
  creadoEn: string;
}

// — Temario / Material —
export interface Recurso {
  id: string;
  titulo: string;
  /** "enlace" (URL) o "archivo" (subido). */
  tipo: "enlace" | "archivo";
  url?: string;
}

export interface Tema {
  id: string;
  titulo: string;
  descripcion: string;
  /** Contenido/objetivos en texto enriquecido (markdown/HTML simple). */
  contenido: string;
  recursos: Recurso[];
  creadoEn: string;
  actualizadoEn: string;
}

// — Clases —
export interface Clase {
  id: string;
  tipo: TipoClase;
  temaId: string;
  /** Fecha en formato "YYYY-MM-DD". */
  fecha: string;
  /** Hora de inicio en minutos desde medianoche (ej: 540 = 09:00). */
  inicioMin: number;
  duracion: DuracionClase;
  profeId: string;
  alumnoIds: string[];
  notas?: string;
  /** Si la clase se realizó, se reagendó, se canceló, etc. */
  estadoRealizacion: EstadoRealizacion;
}

// — Pago (por alumno y por clase) — solo visible para ADMIN —
export interface Pago {
  id: string;
  claseId: string;
  alumnoId: string;
  estado: EstadoPago;
  monto?: number;
  fecha?: string;
}

// — Tarifas a profes (cuánto cobra el profe por clase) — solo ADMIN —
export interface Tarifa {
  id: string;
  profeId: string;
  /** Valor POR HORA de clase grupal e individual. Editable en el tiempo. */
  valorGrupal: number;
  valorIndividual: number;
  /** Compensación fija cuando la clase se cae (el alumno canceló tarde, no
   *  avisó o no se conectó): el alumno no paga, pero el profe reservó el
   *  horario y se le abona igual. No depende de la duración. */
  valorCanceladaIndividual: number;
  valorCanceladaGrupal: number;
  /** Desde cuándo rige esta tarifa (para "congelar" valores históricos). */
  vigenteDesde: string;
}

// — Reporte de clase (lo carga el profe) —
export interface ReporteAlumno {
  alumnoId: string;
  queLeCosto: string;
  enfasis: string;
  loQueMasLeCuesta: string;
}

export interface ReporteClase {
  id: string;
  claseId: string;
  metodo: string;
  temaDado: string;
  observaciones: string;
  porAlumno: ReporteAlumno[];
  creadoEn: string;
}

// — Ficha evolutiva: seguimiento del alumno (independiente de la agenda).
//   Lo cargan/editan profes y admin desde la ficha del alumno. —
export interface Seguimiento {
  id: string;
  alumnoId: string;
  /** Fecha de la clase / del registro, en formato "YYYY-MM-DD". */
  fecha: string;
  /** Tema dado en esa clase. */
  tema: string;
  /** Cómo se desenvolvió el alumno. */
  desempeno: string;
  /** En qué reforzar / qué le costó. */
  aReforzar: string;
  /** Quién cargó la entrada. */
  autorId?: string;
  autorNombre: string;
  creadoEn: string;
  actualizadoEn: string;
}

// — Solicitud de inscripción (formulario público) —
export interface Solicitud {
  id: string;
  nombre: string;
  contacto: string;
  carrera: string;
  temaInteres: string;
  preferencia: PreferenciaModalidad;
  mensaje?: string;
  estado: EstadoSolicitud;
  creadoEn: string;
}
