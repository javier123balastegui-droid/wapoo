import "server-only";
import { buscarEnBiblioteca } from "@/lib/biblioteca";
import { registrarUso, costoDe } from "@/lib/bot/uso";
import { getConfigBot } from "@/lib/bot/config";
import Anthropic from "@anthropic-ai/sdk";
import { perfilDeOrg, type PerfilTexto } from "@/lib/bot/plantilla-prompt";
import { getOrganizacion, diasConClase, monedaDe, zonaDe } from "@/lib/organizacion";
import { montoTexto, type Moneda } from "@/lib/utils";
import type { MensajeBot } from "@/lib/bot/conversaciones";
import { leerAdjuntoBase64 } from "@/lib/bot/comprobantes";
import {
  ahoraEn,
  fechaLargaES,
  sumarDias,
  nombreDiaLargo,
  enZonaDelAlumno,
  etiquetaDeZona,
  ZONA_ARGENTINA,
  ZONAS_HORARIAS,
} from "@/lib/fechas";
import {
  crearPerfilAlumno,
  puedeConsultarDudas,
  registrarPagoAlumno,
  estadoDeCuentaAlumno,
  misClasesFuturas,
  horariosDisponibles,
  reagendarClase,
  derivarAHumano,
  consultarALaDirectora,
  vincularPerfilAlumno,
  preciosVigentes,
  avisarComprobante,
  datosAlumnoDeContacto,
  agendarClaseBot,
  companerosHabituales,
} from "@/lib/bot/acciones";
import {
  iniciarCoordinacionGrupal,
  registrarRespuestaCoordinacion,
  coordinacionPendientePara,
} from "@/lib/bot/coordinacion";

/**
 * Llamada a la API de Claude que arma las respuestas del bot.
 *
 * El system prompt (SYSTEM_PROMPT) define la personalidad y las reglas del
 * negocio. Además el bot tiene "herramientas" (function calling): acciones que
 * puede ejecutar en la plataforma, como dar de alta a un alumno.
 */

// Modelo: Claude Sonnet 5. Se eligió por sobre Haiku 4.5 porque el bot no solo
// agenda clases: también contesta consultas de anatomía a alumnas que rinden
// finales, y ahí la precisión importa más que el precio. Si alguna vez hace
// falta todavía más calidad, "claude-opus-5" entra sin tocar nada más.
const MODELO = "claude-sonnet-5";

// Sonnet 5 razona antes de responder, y ese razonamiento sale del mismo
// presupuesto que la respuesta. Con los 1024 de antes, una explicación de
// anatomía se cortaba por la mitad. Solo se paga lo que realmente se genera,
// así que subir el techo no encarece las respuestas cortas.
const MAX_TOKENS = 4096;

// Cuántas veces, como máximo, dejamos que el bot use una herramienta y siga
// pensando en una misma respuesta (evita loops infinitos).
const MAX_VUELTAS_HERRAMIENTAS = 6;

/**
 * Búsqueda en internet (corre en los servidores de Anthropic, USD 10 cada
 * 1.000 búsquedas). El bot la usa SOLO si un tema de estudio no está en la
 * biblioteca: la bibliografía de la cátedra va primero. Tope de 2 búsquedas
 * por consulta para que no se vaya de costo ni de tiempo. Es la versión
 * básica: la de filtrado dinámico corre código para filtrar resultados y
 * tardaba demasiado para un WhatsApp.
 */
const BUSQUEDA_WEB = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 2,
  user_location: {
    type: "approximate",
    country: "AR",
    timezone: "America/Argentina/Buenos_Aires",
  },
} as const;

/** Lo que devuelve el bot en cada turno: el texto para el alumno y el
 *  registro de lo que hizo (herramientas usadas), que se guarda aparte. */
export type RespuestaBot = { texto: string; acciones: string[] };

let clienteCache: Anthropic | null = null;

function getCliente(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Falta ANTHROPIC_API_KEY en el servidor (agregala a .env.local).",
    );
  }
  clienteCache ??= new Anthropic();
  return clienteCache;
}

// Definición de las herramientas que el bot puede usar. El `description` y el
// esquema le dicen a Claude para qué sirve cada una y qué datos necesita.
const HERRAMIENTAS: Anthropic.Tool[] = [
  {
    name: "crear_perfil_alumno",
    description:
      "Da de alta el perfil del alumno en la plataforma y devuelve su código " +
      "de acceso personal. Usala SOLO cuando el alumno ya confirmó que quiere " +
      "tomar clases y te dio, como mínimo, su nombre y apellido, la carrera y " +
      "su correo Gmail. Sirve también para dar de alta a los compañeros de una " +
      "clase grupal (con los datos de cada uno): el perfil queda creado aunque " +
      "todavía no escriban ellos. No la uses dos veces para la misma persona.",
    input_schema: {
      type: "object",
      properties: {
        nombre: {
          type: "string",
          description: "Nombre y apellido del alumno.",
        },
        carrera: {
          type: "string",
          description: "Carrera que cursa el alumno.",
        },
        email: {
          type: "string",
          description: "Correo Gmail del alumno (para el alta en la plataforma).",
        },
        zona_horaria: {
          type: "string",
          enum: ZONAS_HORARIAS.map((z) => z.zona),
          description:
            "Zona horaria del alumno. Mandala SOLO si el alumno dijo que está " +
            "fuera de Argentina (o que es de otro país). Si no dijo nada, " +
            "omitila: se asume Argentina. No se lo preguntes de la nada.",
        },
      },
      required: ["nombre", "carrera", "email"],
    },
  },
  {
    name: "vincular_mi_perfil",
    description:
      "Conecta este WhatsApp con un perfil que ya existe en la plataforma. " +
      "Usala cuando quien escribe dice que ya está anotado o que lo anotó un " +
      "compañero, y vos no lo reconocés: pedile el correo con el que quedó " +
      "registrado y pasalo acá. Si coincide, a partir de ahí lo tratás como " +
      "ese alumno (sus clases, su código).",
    input_schema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Correo con el que figura registrado el alumno.",
        },
      },
      required: ["email"],
    },
  },
  {
    name: "registrar_pago",
    description:
      "Registra un pago del alumno y lo imputa a las clases que debe. Sirve " +
      "para CUALQUIER monto: la seña, la clase completa, lo que faltaba de una " +
      "clase ya señada, o varias clases juntas. Pasale el monto que figura en " +
      "el comprobante y la herramienta se encarga del resto: calcula el precio " +
      "de cada clase y te dice cuáles quedaron pagadas, cuáles señadas y cuánto " +
      "falta. Usala después de ver el comprobante y comprobar que es una " +
      "transferencia a nuestra cuenta con fecha reciente. NO calcules vos los " +
      "precios ni decidas a qué clase corresponde: pasá el monto y listo.",
    input_schema: {
      type: "object",
      properties: {
        monto: {
          type: "number",
          description:
            "El monto transferido, tal como figura en el comprobante, en " +
            "números y sin símbolos ni puntos (ej: 13500).",
        },
        concepto: {
          type: "string",
          enum: ["sena", "total", "lo_que_cubra"],
          description:
            "Qué dijo el alumno que está pagando. Importa porque el monto " +
            "solo no alcanza para saberlo: con la seña en 4.500 y clases de " +
            "9.500, un pago de 13.500 puede ser una clase completa o la seña " +
            "de tres. Usá 'sena' si dijo que manda la seña (de una o de " +
            "varias clases), 'total' si dijo que paga las clases completas, y " +
            "'lo_que_cubra' si no lo aclaró. Ante la duda, preguntale antes de " +
            "registrar: es la plata de alguien.",
        },
      },
      required: ["monto"],
    },
  },
  {
    name: "estado_de_cuenta",
    description:
      "Qué debe el alumno: cada clase pendiente con su precio, lo que ya " +
      "entregó y lo que falta, más el total. Incluye las clases que ya se " +
      "dieron y quedaron sin pagar. Usala cuando pregunte cuánto debe o cuánto " +
      "le falta, antes de pedirle que transfiera, y cuando recibas un " +
      "comprobante y quieras saber de qué montos estás hablando. Los números " +
      "los pasás tal como te los da: no los recalcules.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "agendar_clase",
    description:
      "Agenda una clase NUEVA para el alumno: se la anotás vos, no hace falta " +
      "que entre a la web. Usala cuando el alumno YA está dado de alta y te " +
      "confirmó tipo de clase, día, horario y duración. Si es grupal y te dice " +
      "con quiénes viene, pasá sus nombres en 'companeros' (tienen que estar ya " +
      "dados de alta). La clase queda con la seña pendiente.",
    input_schema: {
      type: "object",
      properties: {
        tipo: {
          type: "string",
          enum: ["INDIVIDUAL", "GRUPAL"],
          description: "Tipo de clase que quiere el alumno.",
        },
        fecha: { type: "string", description: "Día, formato AAAA-MM-DD." },
        hora: { type: "string", description: "Horario de inicio, formato HH:MM." },
        duracion_min: {
          type: "integer",
          description: "Duración en minutos: 60 o más, de a 30 (60, 90, 120, 150, 180…).",
        },
        companeros: {
          type: "array",
          items: { type: "string" },
          description:
            "Solo si es GRUPAL: nombres de los compañeros con los que viene, si te los dice. " +
            "Usá el NOMBRE COMPLETO (nombre y apellido), nunca el apodo: si el alumno dice " +
            "'el Tomi' y sabés por el contexto que es Tomás Peralta, pasá 'Tomás Peralta'.",
        },
      },
      required: ["tipo", "fecha", "hora", "duracion_min"],
    },
  },
  {
    name: "mis_clases",
    description:
      "Lista las clases futuras del alumno (fecha, hora, tipo, cuántos " +
      "integrantes tiene y estado de la seña). Usala cuando el alumno quiere " +
      "reagendar, para saber cuál clase mover y confirmar con él cuál es.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "horarios_disponibles",
    description:
      "Devuelve los horarios de inicio libres para un día y una duración, según " +
      "los días y horarios en que se dan clases. Usala para ofrecerle al alumno " +
      "cuándo puede reagendar.",
    input_schema: {
      type: "object",
      properties: {
        fecha: { type: "string", description: "Día en formato AAAA-MM-DD." },
        duracion_min: {
          type: "integer",
          description: "Duración de la clase en minutos: 60 o más, de a 30.",
        },
      },
      required: ["fecha", "duracion_min"],
    },
  },
  {
    name: "reagendar_clase",
    description:
      "Reagenda una clase INDIVIDUAL del alumno: borra la vieja y crea la nueva, " +
      "manteniendo la seña. La clase a mover se identifica por su día y hora " +
      "ACTUALES. Usala SOLO cuando el alumno confirmó el nuevo día y horario. Si " +
      "la clase es grupal con más de un integrante, te va a avisar que hay que " +
      "coordinar con los demás.",
    input_schema: {
      type: "object",
      properties: {
        fecha_actual: {
          type: "string",
          description: "Día actual de la clase a mover, formato AAAA-MM-DD.",
        },
        hora_actual: {
          type: "string",
          description: "Hora actual de inicio de la clase a mover, formato HH:MM.",
        },
        nueva_fecha: {
          type: "string",
          description: "Nuevo día, formato AAAA-MM-DD.",
        },
        nueva_hora: {
          type: "string",
          description: "Nuevo horario de inicio, formato HH:MM (ej: 15:00).",
        },
        duracion_min: {
          type: "integer",
          description:
            "Duración en minutos (60 o más, de a 30). Opcional: si no la pasás, se " +
            "mantiene la de la clase original.",
        },
      },
      required: ["fecha_actual", "hora_actual", "nueva_fecha", "nueva_hora"],
    },
  },
  {
    name: "iniciar_coordinacion_grupal",
    description:
      "Arranca la coordinación para reagendar una clase GRUPAL: le pregunta a " +
      "cada uno de los demás integrantes si se mueven al nuevo horario. Usala " +
      "cuando un integrante de una clase grupal quiere reagendar y YA te dio el " +
      "nuevo día y horario que propone. La clase actual se identifica por su día " +
      "y hora ACTUALES. No aplica el cambio todavía: espera la respuesta de todos.",
    input_schema: {
      type: "object",
      properties: {
        fecha_actual: { type: "string", description: "Día actual de la clase, AAAA-MM-DD." },
        hora_actual: { type: "string", description: "Hora actual de inicio, HH:MM." },
        nueva_fecha: { type: "string", description: "Nuevo día propuesto, AAAA-MM-DD." },
        nueva_hora: { type: "string", description: "Nuevo horario propuesto, HH:MM." },
        duracion_min: {
          type: "integer",
          description: "Duración en minutos (60 o más, de a 30). Opcional: si no la pasás, se mantiene la actual.",
        },
      },
      required: ["fecha_actual", "hora_actual", "nueva_fecha", "nueva_hora"],
    },
  },
  {
    name: "responder_coordinacion_grupal",
    description:
      "Registra la respuesta de un integrante a una consulta grupal pendiente " +
      "(si se mueve al nuevo horario o si se queda en el actual). Usala SOLO " +
      "cuando el contexto te indica que este alumno tiene una consulta grupal " +
      "pendiente y te está respondiendo. Cuando responden todos, se aplica el " +
      "cambio y se le avisa a cada uno.",
    input_schema: {
      type: "object",
      properties: {
        respuesta: {
          type: "string",
          enum: ["mover", "quedarse"],
          description: "'mover' si acepta el nuevo horario, 'quedarse' si prefiere mantener el actual.",
        },
      },
      required: ["respuesta"],
    },
  },
  {
    name: "derivar_a_humano",
    description:
      "Pasa la conversación a la directora: a partir de ahí el bot deja de " +
      "responder. Usala SOLO cuando el alumno pide hablar con una persona, hay un " +
      "reclamo o algo tenso, o un problema con un pago que no podés resolver. " +
      "Para una pregunta que no sabés contestar NO la uses: usá " +
      "consultar_a_la_directora y seguí atendiendo. Igual respondele al alumno " +
      "avisándole que lo derivás.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "consultar_a_la_directora",
    description:
      "Le pasa a la directora una pregunta que no sabés contestar (un dato del " +
      "equipo, algo que no está en esta guía, un tema de estudio que no " +
      "encontraste ni en la biblioteca ni en internet). Le llega un aviso al " +
      "celular y ella le responde al alumno por acá cuando pueda. La " +
      "conversación sigue con vos: decile al alumno que se lo consultás a la " +
      "directora y seguí ayudándolo con lo demás.",
    input_schema: {
      type: "object",
      properties: {
        pregunta: {
          type: "string",
          description:
            "Qué preguntó el alumno, en una frase clara (ej: 'si Agustín da " +
            "clases de histología').",
        },
      },
      required: ["pregunta"],
    },
  },
  {
    name: "avisar_comprobante",
    description:
      "Le avisa a la directora al celular que llegó un comprobante de pago, con " +
      "lo que leíste en él. Usala SIEMPRE que el alumno te mande un comprobante " +
      "de transferencia, coincida o no, y una sola vez por comprobante. No la " +
      "uses para fotos que no son comprobantes. No hace falta contárselo al alumno.",
    input_schema: {
      type: "object",
      properties: {
        monto: {
          type: "string",
          description: "Monto tal como figura en el comprobante (ej: '$5.000').",
        },
        fecha: {
          type: "string",
          description: "Fecha de la transferencia (ej: '10/9').",
        },
        coincide: {
          type: "boolean",
          description:
            "true si es una transferencia a nuestra cuenta, por el monto que " +
            "corresponde y con fecha reciente.",
        },
        observacion: {
          type: "string",
          description:
            "Si no coincide, qué no cierra, en pocas palabras (ej: 'monto " +
            "distinto a la seña', 'otra cuenta', 'fecha de hace un mes').",
        },
      },
      required: ["monto", "fecha", "coincide"],
    },
  },
  {
    name: "consultar_biblioteca",
    description:
      "Busca en la biblioteca de anatomía de la academia (los libros de " +
      "referencia cargados por la dirección) los pasajes que hablan de un tema. " +
      "USALA SIEMPRE antes de contestar cualquier consulta de anatomía o " +
      "biofísica, aunque creas saber la respuesta: la alumna tiene que estudiar " +
      "por el material de la cátedra, no por otra fuente. Pasá términos " +
      "anatómicos concretos (ej: 'nervio mediano túnel carpiano'), no la " +
      "pregunta entera. Si lo que devuelve no trata lo que preguntó, probá UNA " +
      "vez más con el nombre clásico que usan los tratados ('complejo " +
      "amigdalino' en vez de 'amígdala', 'epitróclea' en vez de 'epicóndilo " +
      "medial', 'conducto carpiano' en vez de 'túnel carpiano') y sin palabras " +
      "genéricas como 'funciones'. Si tampoco, usá buscar_en_internet y aclarale " +
      "al alumno que eso no sale de la bibliografía de la cátedra y de qué " +
      "sitio lo sacaste.",
    input_schema: {
      type: "object",
      properties: {
        consulta: {
          type: "string",
          description:
            "Términos anatómicos a buscar, en español (ej: 'irrigación del miocardio').",
        },
      },
      required: ["consulta"],
    },
  },
  {
    name: "buscar_en_internet",
    description:
      "Busca un tema de estudio en internet, en fuentes académicas confiables, y " +
      "te devuelve un resumen con las fuentes. Usala SOLO si consultar_biblioteca " +
      "no trajo nada sobre el tema (o lo que trajo no trata lo que preguntó). " +
      "Nunca para precios, horarios ni datos de la academia.",
    input_schema: {
      type: "object",
      properties: {
        consulta: {
          type: "string",
          description:
            "Qué buscar, en español y con términos técnicos (ej: 'ley de " +
            "Frank-Starling curva de función ventricular').",
        },
      },
      required: ["consulta"],
    },
  },
];

/** Convierte "HH:MM" a minutos desde medianoche. Devuelve NaN si es inválido. */
function horaAMin(hora: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!m) return NaN;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * La zona horaria que mandó el bot, solo si es una de las que manejamos.
 * Cualquier otra cosa (una inventada, un país escrito a mano) se descarta y el
 * alumno queda en la hora de la academia, que es lo que vale por defecto.
 */
function zonaValida(v: unknown, zonaAcademia: string): string | undefined {
  const z = String(v ?? "").trim();
  if (!z || z === zonaAcademia) return undefined;
  return ZONAS_HORARIAS.some((x) => x.zona === z) ? z : undefined;
}

/** Ejecuta la herramienta que pidió el bot y devuelve el texto del resultado. */
async function ejecutarHerramienta(
  orgId: string,
  nombre: string,
  input: Record<string, unknown>,
  contacto: string,
): Promise<string> {
  try {
    // Las dos herramientas que resuelven dudas de estudio van con control de
    // acceso, y se controla ACÁ y no en el prompt: una instrucción escrita se
    // puede dar vuelta conversando, y esto tiene plata atrás. Si la persona no
    // es alumna, la herramienta no devuelve contenido y el bot no tiene qué
    // copiar.
    if (HERRAMIENTAS_DE_ESTUDIO.includes(nombre)) {
      const permiso = await puedeConsultarDudas(orgId, contacto);
      if (!permiso.habilitado) {
        return JSON.stringify({
          ok: false,
          sin_acceso: true,
          mensaje:
            "Esta persona todavía no es alumna, así que NO le resuelvas la duda: " +
            "ni con la biblioteca, ni de internet, ni de memoria. " +
            (permiso.motivo === "sin_perfil"
              ? "No está dada de alta. "
              : "Está dada de alta pero no tiene ninguna clase dada ni señada. ") +
            "Contale con buena onda que las consultas son parte de las clases, " +
            "que en la clase el profe se lo explica con tiempo, y ofrecele " +
            "agendar una. Si ya tiene una clase agendada, decile que la seña la " +
            "deja confirmada y que desde ahí le podés dar una mano con las dudas.",
        });
      }
    }

    if (nombre === "crear_perfil_alumno") {
      const perfil = await crearPerfilAlumno(orgId, {
        nombre: String(input.nombre ?? "").trim(),
        carrera: String(input.carrera ?? "").trim(),
        email: input.email ? String(input.email).trim() : undefined,
        telefono: contacto, // el contacto de WhatsApp queda como teléfono
        zonaHoraria: zonaValida(input.zona_horaria, await zonaDe(orgId)),
      });
      return JSON.stringify({
        ok: true,
        codigo_acceso: perfil.codigoAcceso,
        ya_existia: perfil.yaExistia,
        mensaje: perfil.yaExistia
          ? `Este alumno YA tenía perfil (no se creó uno nuevo). Su código de acceso es ${perfil.codigoAcceso}. Pasáselo con naturalidad.`
          : `Perfil creado. Código de acceso: ${perfil.codigoAcceso}`,
      });
    }
    if (nombre === "estado_de_cuenta") {
      const r = await estadoDeCuentaAlumno(orgId, contacto);
      if (!r.ok) {
        return JSON.stringify({
          ok: false,
          motivo:
            "No encuentro un perfil a nombre de este contacto, así que no " +
            "tengo cuenta para mirar. Primero hay que darlo de alta.",
        });
      }
      if (r.pendientes.length === 0) {
        return JSON.stringify({
          ok: true,
          al_dia: true,
          mensaje: "No debe nada: todas sus clases están saldadas. Decíselo así.",
        });
      }
      return JSON.stringify({
        ok: true,
        al_dia: false,
        clases: r.pendientes,
        total_falta: r.totalFalta,
        sena: r.sena,
        mensaje:
          "Pasale el detalle clase por clase con estos mismos números, sin " +
          "recalcular nada. 'yaSeDio' en true es una clase que ya tomó y " +
          "quedó debiendo; en false, una que todavía no tuvo. Si le conviene, " +
          "podés recordarle que para reservar alcanza con la seña.",
      });
    }
    if (nombre === "registrar_pago") {
      const monto = Number(input.monto);
      if (!Number.isFinite(monto) || monto <= 0) {
        return JSON.stringify({
          ok: false,
          motivo:
            "Pasá el monto del comprobante como número (ej: 13500). Si no se " +
            "lee bien, pedile al alumno que lo reenvíe.",
        });
      }
      const concepto =
        input.concepto === "sena" || input.concepto === "total"
          ? input.concepto
          : "lo_que_cubra";
      const r = await registrarPagoAlumno(orgId, contacto, monto, concepto);
      if (!r.ok) {
        const motivo =
          r.motivo === "sin_perfil"
            ? "No encuentro un perfil a nombre de este contacto. El alumno tiene que estar dado de alta primero."
            : r.motivo === "sin_clase_pendiente"
              ? "No veo ninguna clase pendiente de pago a nombre de este alumno. Puede que todavía no la haya agendado."
              : `Ese monto no alcanza ni para señar la próxima clase (la seña es ${r.minimo}). No lo registré: decíselo con amabilidad y avisale a la directora.`;
        return JSON.stringify({ ok: false, motivo });
      }
      return JSON.stringify({
        ok: true,
        clases: r.clases,
        sobrante: r.sobrante,
        mensaje:
          "Pago registrado. Confirmale clase por clase cómo quedó, con la fecha " +
          "y la hora de cada una, usando los datos de 'clases' y sin recalcular " +
          "nada. A las que quedaron SENADO decile cuánto falta; a las PAGADO, " +
          "que quedan saldadas. Si la clase es de hoy o futura, pasale el link." +
          (r.sobrante > 0
            ? ` OJO: sobraron ${r.sobrante} sin imputar a ninguna clase. Decíselo, no le prometas un crédito, y avisale a la directora con consultar_a_la_directora.`
            : ""),
      });
    }
    if (nombre === "agendar_clase") {
      const inicio = horaAMin(String(input.hora ?? ""));
      if (Number.isNaN(inicio)) {
        return JSON.stringify({
          ok: false,
          motivo: "El horario tiene que estar en formato HH:MM (ej: 15:00).",
        });
      }
      const tipo = String(input.tipo ?? "") === "GRUPAL" ? "GRUPAL" : "INDIVIDUAL";
      const comp = Array.isArray(input.companeros)
        ? (input.companeros as unknown[]).map((c) => String(c))
        : undefined;
      const r = await agendarClaseBot(
        orgId,
        contacto,
        tipo,
        String(input.fecha ?? "").trim(),
        inicio,
        Number(input.duracion_min),
        comp,
      );
      if (!r.ok) {
        if (r.motivo === "companeros_sin_identificar") {
          return JSON.stringify({
            ok: false,
            companeros_sin_identificar: r.noEncontrados,
            instruccion:
              "LA CLASE NO QUEDÓ AGENDADA (no toqué nada). No pude identificar a esos compañeros: " +
              "puede ser que el nombre sea un apodo o esté incompleto, que haya más de un alumno " +
              "parecido, o que todavía no estén dados de alta. NO afirmes que no están dados de alta " +
              "ni digas que la clase quedó agendada. Preguntale al alumno el nombre y apellido " +
              "completo de esa persona y volvé a llamar a agendar_clase con la lista completa de " +
              "compañeros. Si el alumno te confirma que esa persona todavía no toma clases con " +
              "nosotros, avisale que primero tiene que darse de alta, y ofrecele agendar la clase " +
              "con los demás (llamá a agendar_clase de nuevo sin ese nombre).",
          });
        }
        const motivo =
          r.motivo === "sin_perfil"
            ? "El alumno todavía no tiene perfil: primero dale el alta con crear_perfil_alumno."
            : r.motivo === "solapa"
              ? "Ese horario ya está ocupado por otra clase."
              : (r.detalle ?? "El horario elegido no es válido.");
        return JSON.stringify({
          ok: false,
          motivo,
          instruccion:
            "LA CLASE NO QUEDÓ AGENDADA. NO le digas al alumno que quedó agendada ni confirmada. " +
            "Explicale con naturalidad el motivo y ofrecele otra opción (usá horarios_disponibles " +
            "para ver qué horarios quedan libres ese día).",
        });
      }
      return JSON.stringify({
        ok: true,
        clase_agendada: {
          fecha: r.clase.fechaHum,
          hora: r.clase.hora,
          tipo: r.clase.tipo,
        },
        integrantes: r.integrantes,
        companeros_agregados: r.agregados,
        nota: r.yaEstaba
          ? "Esta clase YA ESTABA agendada a nombre del alumno (no se creó otra). No le digas que hubo un problema ni que no quedó reservada: sigue en pie, con la seña pendiente si todavía no la pagó."
          : "La clase quedó agendada con la seña PENDIENTE: recordale que sin la seña no queda confirmada.",
      });
    }
    if (nombre === "mis_clases") {
      const clases = await misClasesFuturas(orgId, contacto);
      if (clases.length === 0) {
        return JSON.stringify({
          ok: true,
          clases: [],
          nota: "El alumno no tiene clases futuras agendadas.",
        });
      }
      return JSON.stringify({
        ok: true,
        clases: clases.map((c) => ({
          clase_id: c.id,
          fecha_iso: c.fecha,
          fecha: c.fechaHum,
          hora: c.hora,
          duracion_min: c.duracionMin,
          tipo: c.tipo,
          integrantes: c.integrantes,
          estado_sena: c.estadoPago,
        })),
      });
    }
    if (nombre === "horarios_disponibles") {
      const r = await horariosDisponibles(
        orgId,
        contacto,
        String(input.fecha ?? "").trim(),
        Number(input.duracion_min),
      );
      if (!r.ok) return JSON.stringify({ ok: false, motivo: r.motivo });
      return JSON.stringify({ ok: true, dia: r.dia, horarios: r.horarios });
    }
    if (nombre === "reagendar_clase") {
      const inicioActual = horaAMin(String(input.hora_actual ?? ""));
      const inicioNuevo = horaAMin(String(input.nueva_hora ?? ""));
      if (Number.isNaN(inicioActual) || Number.isNaN(inicioNuevo)) {
        return JSON.stringify({
          ok: false,
          motivo: "Las horas tienen que estar en formato HH:MM (ej: 15:00).",
        });
      }
      const duracion =
        input.duracion_min == null ? undefined : Number(input.duracion_min);
      const r = await reagendarClase(
        orgId,
        contacto,
        String(input.fecha_actual ?? "").trim(),
        inicioActual,
        String(input.nueva_fecha ?? "").trim(),
        inicioNuevo,
        duracion,
      );
      if (!r.ok) {
        const motivo =
          r.motivo === "sin_perfil"
            ? "No encuentro un perfil a nombre de este contacto."
            : r.motivo === "clase_no_encontrada"
              ? "No encuentro esa clase a nombre del alumno."
              : r.motivo === "grupal_requiere_coordinacion"
                ? `Es una clase grupal de ${r.integrantes} personas. No se puede mover directo: hay que consultar a todos los integrantes antes de reagendar.`
                : r.motivo === "solapa"
                  ? "Ese horario ya está ocupado por otra clase de la academia (no " +
                    "necesariamente de este alumno). Ofrecele otros horarios con " +
                    "horarios_disponibles."
                  : (r.detalle ?? "El horario elegido no es válido.");
        return JSON.stringify({ ok: false, motivo });
      }
      return JSON.stringify({
        ok: true,
        clase_reagendada: { fecha: r.clase.fechaHum, hora: r.clase.hora, tipo: r.clase.tipo },
        sena_mantenida: r.estadoPago !== "SIN_PAGAR",
        sena_perdida: r.senaPerdida,
        nota: r.senaPerdida
          ? "Avisó con menos de 3 hs de anticipación: se reagendó igual pero se pierde la seña. Avisale con tacto que va a tener que señar de nuevo para confirmar la clase."
          : r.estadoPago === "SIN_PAGAR"
            ? "Todavía no había pagado la seña: sigue pendiente para confirmar la clase nueva."
            : "La seña que ya había pagado se mantiene.",
      });
    }
    if (nombre === "iniciar_coordinacion_grupal") {
      const inicioActual = horaAMin(String(input.hora_actual ?? ""));
      const inicioNuevo = horaAMin(String(input.nueva_hora ?? ""));
      if (Number.isNaN(inicioActual) || Number.isNaN(inicioNuevo)) {
        return JSON.stringify({
          ok: false,
          motivo: "Las horas tienen que estar en formato HH:MM (ej: 15:00).",
        });
      }
      const duracion =
        input.duracion_min == null ? undefined : Number(input.duracion_min);
      const r = await iniciarCoordinacionGrupal(
        orgId,
        contacto,
        String(input.fecha_actual ?? "").trim(),
        inicioActual,
        String(input.nueva_fecha ?? "").trim(),
        inicioNuevo,
        duracion,
      );
      if (!r.ok) {
        const motivo =
          r.motivo === "sin_perfil"
            ? "No encuentro un perfil a nombre de este contacto."
            : r.motivo === "clase_no_encontrada"
              ? "No encuentro esa clase grupal a nombre del alumno."
              : r.motivo === "no_es_grupal"
                ? "Esa clase no es grupal (o el alumno está solo), se puede reagendar directo con reagendar_clase."
                : r.motivo === "solapa"
                  ? "El horario propuesto se pisa con otra clase ya agendada."
                  : r.motivo === "ya_en_curso"
                    ? "Ya hay una consulta grupal en curso para esa clase; esperá a que respondan todos."
                    : (r.detalle ?? "El horario propuesto no es válido.");
        return JSON.stringify({ ok: false, motivo });
      }
      return JSON.stringify({
        ok: true,
        integrantes_consultados: r.integrantesConsultados,
        mensaje: `Consulta enviada a ${r.integrantesConsultados} integrante(s). Avisale al alumno que estás confirmando con los demás y le avisás en cuanto respondan.`,
      });
    }
    if (nombre === "responder_coordinacion_grupal") {
      const quiereMover = String(input.respuesta ?? "").trim() === "mover";
      const r = await registrarRespuestaCoordinacion(orgId, contacto, quiereMover);
      if (!r.ok) {
        const motivo =
          r.motivo === "sin_perfil"
            ? "No encuentro un perfil a nombre de este contacto."
            : "Este alumno no tiene ninguna consulta grupal pendiente de responder.";
        return JSON.stringify({ ok: false, motivo });
      }
      return JSON.stringify({
        ok: true,
        resuelta: r.resuelta,
        faltan: r.faltan,
        tu_clase: r.resuelta && r.tuClase
          ? {
              fecha: r.tuClase.fechaHum,
              hora: r.tuClase.hora,
              tipo: r.tuClase.tipo,
              integrantes: r.tuClase.integrantes,
              precio_por_hora: r.tuClase.precioPorAlumno,
            }
          : undefined,
        mensaje: r.resuelta
          ? "Respondieron todos y ya se repartió el grupo. Contale a ESTE alumno cómo le queda SU clase con los datos de tu_clase: día, hora y, si cambió, con cuántos queda y cuánto sale la hora. Si quedó solo, decile con tacto que la clase pasa a ser individual y que por eso el valor por hora sube. La seña que ya pagó se mantiene. A los demás ya se les avisó."
          : `Registrada la respuesta. Todavía faltan ${r.faltan} integrante(s) por responder. Agradecele y decile que le confirmás cuando estén todos.`,
      });
    }
    if (nombre === "derivar_a_humano") {
      await derivarAHumano(orgId, contacto);
      return JSON.stringify({
        ok: true,
        mensaje: "Conversación derivada. La directora seguirá desde acá.",
      });
    }
    if (nombre === "buscar_en_internet") {
      const consulta = String(input.consulta ?? "").trim();
      if (!consulta) {
        return JSON.stringify({ ok: false, error: "Falta qué buscar." });
      }
      return await buscarEnInternet(orgId, consulta);
    }
    if (nombre === "vincular_mi_perfil") {
      const email = String(input.email ?? "").trim();
      if (!email) return JSON.stringify({ ok: false, error: "Falta el correo." });
      const r = await vincularPerfilAlumno(orgId, contacto, email);
      if (!r.ok) {
        return JSON.stringify({
          ok: false,
          mensaje:
            r.motivo === "sin_perfil"
              ? "No hay ningún alumno con ese correo. Pedile que lo revise, o dalo de alta como alumno nuevo."
              : "Ese perfil ya está conectado con otro WhatsApp. No lo cambies vos: consultáselo a la directora.",
        });
      }
      return JSON.stringify({
        ok: true,
        alumno: r.nombre,
        codigo_acceso: r.codigoAcceso,
        mensaje: "Quedó conectado: desde ahora es este alumno. Saludalo por su nombre.",
      });
    }
    if (nombre === "consultar_a_la_directora") {
      const pregunta = String(input.pregunta ?? "").trim();
      if (!pregunta) {
        return JSON.stringify({ ok: false, error: "Falta la pregunta." });
      }
      await consultarALaDirectora(orgId, contacto, pregunta);
      return JSON.stringify({
        ok: true,
        mensaje:
          "Consulta enviada a la directora; ella le va a responder por acá. " +
          "La conversación sigue con vos.",
      });
    }
    if (nombre === "avisar_comprobante") {
      await avisarComprobante(orgId, contacto, {
        monto: String(input.monto ?? "").trim(),
        fecha: String(input.fecha ?? "").trim(),
        coincide: input.coincide === true,
        observacion: String(input.observacion ?? "").trim(),
      });
      return JSON.stringify({
        ok: true,
        mensaje: "Aviso enviado a la directora. No hace falta mencionárselo al alumno.",
      });
    }
    if (nombre === "consultar_biblioteca") {
      const consulta = String(input.consulta ?? "").trim();
      if (!consulta) {
        return JSON.stringify({ ok: false, error: "Falta qué buscar." });
      }
      const pasajes = await buscarEnBiblioteca(orgId, consulta);
      if (pasajes.length === 0) {
        return JSON.stringify({
          ok: true,
          encontrado: false,
          mensaje:
            "No hay nada sobre ese tema en la biblioteca. Usá buscar_en_internet " +
            "y aclarale al alumno que no sale de la bibliografía de la cátedra, " +
            "nombrando el sitio. Si tampoco hay algo confiable, no respondas de " +
            "memoria: usá consultar_a_la_directora.",
        });
      }
      return JSON.stringify({
        ok: true,
        encontrado: true,
        pasajes: pasajes.map((p) => ({
          fuente: p.pagina ? `${p.documento}, p. ${p.pagina}` : p.documento,
          texto: p.contenido,
        })),
      });
    }
    return JSON.stringify({ ok: false, error: `Herramienta desconocida: ${nombre}` });
  } catch (e) {
    const detalle = e instanceof Error ? e.message : "Error desconocido";
    return JSON.stringify({ ok: false, error: detalle });
  }
}

/**
 * Genera la respuesta del bot a partir del historial de la conversación.
 * `historial` incluye el mensaje nuevo del alumno como último elemento.
 * `contacto` es el identificador del alumno (número de WhatsApp / id de prueba).
 */
/** Límite de la API para una imagen. */
/** Las herramientas, con la descripción de la biblioteca de la academia. */
function herramientasDe(perfil: PerfilTexto): Anthropic.Tool[] {
  return HERRAMIENTAS.map((h) =>
    h.name === "consultar_biblioteca" ? { ...h, description: perfil.descripcionBiblioteca } : h,
  );
}

const NOMBRE_DIA = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

/** "Los domingos no hay clases." según los días con clase de la academia. */
function diasSinClase(dias: number[]): string {
  const sin = [1, 2, 3, 4, 5, 6, 0].filter((d) => !dias.includes(d)).map((d) => NOMBRE_DIA[d]);
  if (!sin.length) return "";
  const lista = sin.length > 1 ? `${sin.slice(0, -1).join(", ")} y ${sin.at(-1)}` : sin[0];
  return `Los ${lista} no hay clases.`;
}

const MAX_BYTES_IMAGEN = 5 * 1024 * 1024;

type TipoImagen = "image/jpeg" | "image/png" | "image/webp";

/**
 * Arma el hilo que ve el modelo. Las fotos y PDF que el alumno mandó desde la
 * última respuesta van con el archivo, así el bot puede leer un comprobante
 * (monto, fecha) o entender la foto de un esquema en vez de adivinar.
 *
 * Los anteriores quedan como texto: el bot ya los vio y su respuesta dice qué
 * leyó. Mostrárselos de nuevo encarecería cada turno y lo haría volver a
 * avisar o a confirmar el mismo pago.
 */
/**
 * Marca el último mensaje para el caché. Una respuesta que usa herramientas
 * hace varios pedidos seguidos (buscar en el libro, volver a buscar, contestar)
 * y cada uno reenvía toda la charla con los pasajes: así, del segundo pedido en
 * adelante, lo ya enviado se cobra al 10%. No toca el arreglo original.
 */
function conCacheAlFinal(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages.length === 0) return messages;
  const copia = messages.slice();
  const ultimo = copia[copia.length - 1];
  const bloques: Anthropic.ContentBlockParam[] =
    typeof ultimo.content === "string"
      ? [{ type: "text", text: ultimo.content }]
      : ultimo.content.slice();
  const i = bloques.length - 1;
  bloques[i] = { ...bloques[i], cache_control: { type: "ephemeral" } } as Anthropic.ContentBlockParam;
  copia[copia.length - 1] = { ...ultimo, content: bloques };
  return copia;
}

/** A partir de cuánto silencio se le marca al bot que pasó el tiempo. */
const SALTO_MINIMO_MS = 6 * 60 * 60 * 1000;

/** "2 días", "9 horas"… si entre los dos mensajes hubo un salto grande. */
function saltoDeTiempo(antes?: string, despues?: string): string | null {
  if (!antes || !despues) return null;
  const ms = new Date(despues).getTime() - new Date(antes).getTime();
  if (!(ms >= SALTO_MINIMO_MS)) return null;
  const horas = Math.round(ms / 3_600_000);
  if (horas < 36) return `${horas} horas`;
  const dias = Math.round(horas / 24);
  return `${dias} días`;
}

async function armarMensajes(
  historial: MensajeBot[],
): Promise<Anthropic.MessageParam[]> {
  const ultimaRespuesta = historial.map((m) => m.rol).lastIndexOf("assistant");
  const visibles = new Set(
    historial
      .map((m, i) => (i > ultimaRespuesta && m.rol === "user" && m.adjunto ? i : -1))
      .filter((i) => i >= 0),
  );

  return Promise.all(
    historial.map(async (m0, i): Promise<Anthropic.MessageParam> => {
      // Si el alumno escribe después de un buen rato, se lo marcamos al bot:
      // sin esto, contestaba como nueva una pregunta de hace días que había
      // quedado sin respuesta.
      const salto = saltoDeTiempo(historial[i - 1]?.creadoEn, m0.creadoEn);
      const m =
        salto && m0.rol === "user"
          ? { ...m0, contenido: `[Este mensaje llegó ${salto} después del anterior.] ${m0.contenido}` }
          : m0;
      // Lo que el bot hizo en ese turno va pegado a lo que dijo, así sabe que
      // ya agendó, ya dio de alta o ya avisó, y no lo repite.
      if (m.rol === "assistant" && m.acciones) {
        return {
          role: "assistant",
          content:
            `${m.contenido}\n\n[Registro interno de lo que hiciste en ese turno ` +
            `(no se lo muestres ni se lo menciones al alumno):\n${m.acciones}]`,
        };
      }
      if (!visibles.has(i) || !m.adjunto) {
        return { role: m.rol, content: m.contenido };
      }
      const datos = await leerAdjuntoBase64(m.adjunto.path);
      const bytes = datos ? (datos.length * 3) / 4 : 0;
      const esPdf = m.adjunto.tipo === "application/pdf";
      if (!datos || (!esPdf && bytes > MAX_BYTES_IMAGEN)) {
        return {
          role: "user",
          content: `${m.contenido} [No se pudo abrir el archivo. Pedile que lo reenvíe.]`,
        };
      }
      const archivo: Anthropic.ContentBlockParam = esPdf
        ? {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: datos },
          }
        : {
            type: "image",
            source: {
              type: "base64",
              media_type: m.adjunto.tipo as TipoImagen,
              data: datos,
            },
          };
      return { role: "user", content: [archivo, { type: "text", text: m.contenido }] };
    }),
  );
}

/**
 * Anota lo que consumió una llamada (para Panel → Bot: gasto y saldo). No
 * puede romper una respuesta: si falla, solo queda en el log.
 */
async function anotarUso(orgId: string, r: Anthropic.Message, contacto: string): Promise<void> {
  const u = r.usage;
  const uso = {
    modelo: MODELO,
    entrada: u.input_tokens ?? 0,
    salida: u.output_tokens ?? 0,
    cacheLectura: u.cache_read_input_tokens ?? 0,
    cacheEscritura: u.cache_creation_input_tokens ?? 0,
    busquedas: u.server_tool_use?.web_search_requests ?? 0,
  };
  if (process.env.BOT_LOG_HERRAMIENTAS) {
    console.log(
      `[uso] ${contacto} entrada ${uso.entrada} · caché leída ${uso.cacheLectura} · ` +
        `caché escrita ${uso.cacheEscritura} · salida ${uso.salida} · ` +
        `USD ${costoDe(uso).toFixed(4)}`,
    );
  }
  try {
    await registrarUso(orgId, uso);
  } catch (e) {
    console.error("[uso] no pude anotarlo:", e instanceof Error ? e.message : e);
  }
}

export async function generarRespuestaBot(
  orgId: string,
  historial: MensajeBot[],
  contacto: string,
): Promise<RespuestaBot> {
  const cliente = getCliente();

  // Le damos la fecha/hora actual (de Argentina) y un calendario ya resuelto de
  // los próximos días de clase. Así el modelo NO tiene que calcular fechas por su
  // cuenta (los modelos se equivocan seguido con "el sábado que viene", etc.).
  // Las instrucciones, la biblioteca y los días de clase son los de la academia.
  const org = await getOrganizacion(orgId);
  const perfilBot = perfilDeOrg(org);
  const dias = diasConClase(org);
  // La hora de la academia, y cómo se llama su zona ("Argentina").
  const zona = org.zonaHoraria;
  const lugar = etiquetaDeZona(zona);
  const ahora = ahoraEn(zona);
  const horaAhora = `${String(Math.floor(ahora.minutos / 60)).padStart(2, "0")}:${String(ahora.minutos % 60).padStart(2, "0")}`;
  const calendario: string[] = [];
  for (let i = 0; i < 21 && calendario.length < 14; i++) {
    const iso = sumarDias(ahora.fecha, i);
    const dow = new Date(`${iso}T00:00:00`).getDay();
    if (!dias.includes(dow)) continue; // saltear los días sin clases
    const etiqueta = i === 0 ? "HOY" : i === 1 ? "mañana" : nombreDiaLargo(iso);
    calendario.push(`- ${etiqueta} ${iso}`);
  }
  // Las instrucciones son iguales en todos los mensajes (salvo que cambien los
  // precios) y van en caché; el contexto de este momento va aparte.
  const instrucciones = conPrecios(
    perfilBot.instrucciones,
    await preciosVigentes(orgId),
    (await getConfigBot(orgId)).enlaceClase,
    monedaDe(org),
  );
  let contexto =
    `(Contexto: hoy es ${fechaLargaES(ahora.fecha)}, ` +
    `son las ${horaAhora} en ${lugar}.\n` +
    `Calendario de los próximos días de clase — cuando el alumno mencione un día ` +
    `("el sábado", "el 9", "mañana"…), buscá acá la fecha exacta y usá ESE valor ` +
    `AAAA-MM-DD en tus herramientas. No calcules fechas por tu cuenta. ${diasSinClase(dias)}\n` +
    `${calendario.join("\n")})`;

  // Si el contacto ya es un alumno dado de alta, se lo decimos al bot para que
  // lo reconozca (no le pida los datos de nuevo ni cree otro perfil).
  const alumnoConocido = await datosAlumnoDeContacto(orgId, contacto);
  if (alumnoConocido) {
    contexto +=
      `\n\n(Este contacto YA es un alumno dado de alta: ${alumnoConocido.nombre}, ` +
      `código de acceso ${alumnoConocido.codigoAcceso}. Saludalo por su nombre y tratalo ` +
      `como alumno que ya conocés. NO le pidas de nuevo sus datos ni uses ` +
      `crear_perfil_alumno. Si necesita el código o quiere agendar, recordáselo.)`;

    // Alumno de otro país: las clases siguen siendo en hora de Argentina (la
    // agenda del profe es una sola), pero hay que hablarle en la suya.
    if (alumnoConocido.zonaHoraria && alumnoConocido.zonaHoraria !== zona) {
      const ejemplo = enZonaDelAlumno(ahora.fecha, 18 * 60, alumnoConocido.zonaHoraria, zona);
      // En Anatomía dice "horario argentino", como siempre.
      const horario = zona === ZONA_ARGENTINA ? "horario argentino" : `horario de ${lugar}`;
      contexto +=
        `

(IMPORTANTE — este alumno NO está en ${lugar}: vive en ` +
        `${etiquetaDeZona(alumnoConocido.zonaHoraria)}. Las clases se dan en ${horario} ` +
        `y tus herramientas trabajan SIEMPRE con la hora de ${lugar}: ` +
        `pasales esa. Pero cuando le hables a él, decile SU hora, o las dos ` +
        `("18 hs de ${lugar}, que allá son las ${ejemplo.hora}"). Hoy, las 18:00 ` +
        `de ${lugar} son las ${ejemplo.hora}${ejemplo.cambiaDeDia ? " del día siguiente" : ""} ` +
        `en ${etiquetaDeZona(alumnoConocido.zonaHoraria)}; la diferencia es la misma para ` +
        `cualquier horario. Si te dice una hora, preguntale si la dice en su hora o en la ` +
        `de ${lugar}, salvo que quede claro.)`;
    }

    // Las clases grupales las toma casi siempre el mismo grupo. Darle los
    // nombres completos de sus compañeros de siempre le permite entender
    // apodos ("el Tomi", "la Juli") y proponer el grupo sin preguntar de más.
    const habituales = await companerosHabituales(orgId, contacto);
    if (habituales.length) {
      contexto +=
        `\n\n(Compañeros con los que este alumno ya tomó clases grupales, del más ` +
        `frecuente al menos: ${habituales.join(", ")}. Casi siempre toma la grupal con ` +
        `los mismos. Si te menciona a alguien por apodo o nombre corto ("el Tomi", ` +
        `"la Juli", "Nacho"), lo más probable es que sea uno de ellos: pasale a ` +
        `agendar_clase el NOMBRE COMPLETO de esta lista, no el apodo. Si el apodo no ` +
        `se parece a ninguno o podría ser más de uno, preguntale el nombre completo en ` +
        `vez de adivinar. Si pide una grupal sin decir con quiénes, ofrecele estos ` +
        `mismos compañeros para confirmar.)`;
    }
  }

  // Si este alumno tiene una consulta grupal pendiente, se lo avisamos al bot
  // para que interprete su respuesta y la registre.
  const pendiente = await coordinacionPendientePara(orgId, contacto);
  if (pendiente) {
    contexto +=
      `\n\n(IMPORTANTE — consulta grupal pendiente para este alumno: ` +
      `${pendiente.iniciadorNombre} pidió mover la clase grupal del ` +
      `${pendiente.claseFechaHum} a las ${pendiente.claseHora} para el ` +
      `${pendiente.propFechaHum} a las ${pendiente.propHora}. Si el alumno responde ` +
      `si le sirve ese nuevo horario o si prefiere quedarse en el actual, registrá su ` +
      `respuesta con la herramienta responder_coordinacion_grupal ('mover' o 'quedarse'). ` +
      `Si te dice otra cosa distinta, respondé normal.)`;
  }

  // Armamos el hilo de mensajes a partir del historial guardado, con las
  // fotos y PDF más recientes adjuntos.
  const messages = await armarMensajes(historial);

  // Lo que el bot escribe en el mismo turno en que usa una herramienta es casi
  // siempre narración ("dejame chequear…"), y pegado a la respuesta final
  // quedaba repetido ("dejame chequear… justo está libre"). Así que ese texto
  // no se manda: se le avisa al bot que no llegó, y el mensaje al alumno es el
  // que escribe al final, ya con los resultados. Si al final no escribe nada,
  // se usa lo anterior como respaldo, para no dejar al alumno sin respuesta.
  const textoDe = (r: Anthropic.Message) =>
    r.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  const borradores: string[] = [];

  // Registro de lo que el bot HIZO en este turno (no lo que dijo). Se guarda
  // con su respuesta y se le vuelve a mostrar en los turnos siguientes: sin
  // esto recordaba lo que había dicho pero no lo que había hecho, y a veces
  // reintentaba una reserva que ya existía.
  const acciones: string[] = [];

  const pedir = () =>
    cliente.messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      system: [
        // Herramientas + instrucciones son el grueso de cada pedido (unos
        // 13.000 tokens) y no cambian de un mensaje a otro: en caché se pagan
        // al 10%. Se guardan por 1 hora y no por 5 minutos: dejarlo cuesta un
        // poco más, pero por WhatsApp los mensajes llegan espaciados y con 5
        // minutos casi todas las respuestas pagaban el precio de escribirlo.
        {
          type: "text",
          text: instrucciones,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
        { type: "text", text: contexto },
      ],
      tools: herramientasDe(perfilBot),
      messages: conCacheAlFinal(messages),
    });

  const pedirYAnotar = async () => {
    const r = await pedir();
    await anotarUso(orgId, r, contacto);
    return r;
  };

  let respuesta = await pedirYAnotar();

  // Loop de herramientas: si el bot pidió ejecutar una acción, la corremos,
  // le devolvemos el resultado y lo dejamos seguir hasta que termine de hablar.
  let vueltas = 0;
  while (respuesta.stop_reason === "tool_use" && vueltas < MAX_VUELTAS_HERRAMIENTAS) {
    vueltas++;
    messages.push({ role: "assistant", content: respuesta.content });

    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const bloque of respuesta.content) {
      if (bloque.type === "tool_use") {
        const salida = await ejecutarHerramienta(
          orgId,
          bloque.name,
          bloque.input as Record<string, unknown>,
          contacto,
        );
        acciones.push(
          `${bloque.name} ${JSON.stringify(bloque.input).slice(0, 160)} → ${salida.slice(0, 160)}`,
        );
        // Solo en la batería de pruebas (scripts/bateria-bot.ts): deja ver
        // qué hizo el bot además de lo que contestó.
        if (process.env.BOT_LOG_HERRAMIENTAS) {
          console.log(
            `[herramienta] ${contacto} ${bloque.name} ${JSON.stringify(bloque.input)} -> ${salida.slice(0, 400)}`,
          );
        }
        resultados.push({
          type: "tool_result",
          tool_use_id: bloque.id,
          content: salida,
        });
      }
    }

    const contenido: Array<Anthropic.ToolResultBlockParam | Anthropic.TextBlockParam> = [
      ...resultados,
    ];
    const borrador = textoDe(respuesta);
    if (borrador) {
      borradores.push(borrador);
      contenido.push({
        type: "text",
        text:
          "[Aviso interno: lo que escribiste antes de usar la herramienta NO le " +
          "llegó al alumno. Escribí ahora el mensaje completo, con los resultados, " +
          "sin contar lo que hiciste.]",
      });
    }
    messages.push({ role: "user", content: contenido });
    respuesta = await pedirYAnotar();
  }

  const texto = textoDe(respuesta) || borradores.join("\n\n");

  // El marcador del link se reemplaza más adelante, en procesar.ts: tiene que
  // ser DESPUÉS de limpiar el texto para WhatsApp, porque ese limpiado saca los
  // signos de apertura y le comía los "¡¡¡" al mensaje de la academia.
  return {
    texto: texto || "Perdón, no pude generar una respuesta. Probá de nuevo.",
    acciones,
  };
}

/**
 * Las herramientas que resuelven dudas de estudio. Solo para alumnos: ver
 * puedeConsultarDudas() en lib/bot/acciones.ts.
 */
const HERRAMIENTAS_DE_ESTUDIO = ["consultar_biblioteca", "buscar_en_internet"];

/** El marcador que escribe el bot donde va el mensaje con el link del Meet. */
export const MARCADOR_LINK = "[[LINK_CLASE]]";

/**
 * Reemplaza el marcador por el mensaje con el link, tal como está cargado en
 * Panel → Bot.
 *
 * El bot no escribe ese mensaje: escribe el marcador y acá se pega el texto
 * exacto. Cuando se le pedía copiarlo, lo retipeaba y lo "corregía" solo: le
 * sacaba los signos de apertura de "¡¡¡Éxitos" (por la regla de escribir como
 * en WhatsApp) y arrastraba los delimitadores del prompt. Un texto fijo no se
 * le puede pedir a un modelo que lo repita bien: hay que no dejarlo escribirlo.
 *
 * Si no hay mensaje cargado, el marcador se borra: nunca se le muestra al
 * alumno. El prompt ya le dice que sin link no lo invente y lo consulte con la
 * directora.
 */
export function conMensajeDelLink(texto: string, mensaje: string): string {
  if (!texto.includes(MARCADOR_LINK)) return texto;
  const limpio = texto.replaceAll(MARCADOR_LINK, mensaje.trim());
  // Si el marcador estaba solo en su línea y no había mensaje, no dejar el
  // hueco de líneas vacías que queda al sacarlo.
  return limpio.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Completa los precios del system prompt ({{PRECIO_INDIVIDUAL}}, {{SENA}}…)
 * con los de Panel → Finanzas. Si no se pueden leer, o alguno está en cero,
 * el bot no inventa un número: lo consulta con la directora.
 */
function conPrecios(
  prompt: string,
  p: Awaited<ReturnType<typeof preciosVigentes>>,
  enlaceClase: string,
  moneda: Moneda,
): string {
  const monto = (n: number | undefined) =>
    n && n > 0
      ? montoTexto(n, moneda)
      : "(monto no disponible: no lo inventes, consultalo con consultar_a_la_directora)";
  return prompt
    .replaceAll("{{PRECIO_INDIVIDUAL}}", monto(p?.valorIndividual))
    .replaceAll("{{PRECIO_GRUPAL_2}}", monto(p?.valorGrupal2))
    .replaceAll("{{PRECIO_GRUPAL_3}}", monto(p?.valorGrupal3))
    .replaceAll("{{SENA}}", monto(p?.valorSena))
    .replaceAll(
      "{{ENLACE_CLASE}}",
      // El bot nunca ve el texto del mensaje, así que no puede retipearlo mal:
      // escribe el marcador y el servidor lo reemplaza antes de enviar.
      enlaceClase
        ? `escribí exactamente ${MARCADOR_LINK} (así, con los corchetes) en el lugar donde ` +
          "querés que vaya. Eso se reemplaza solo por el mensaje con el link, que ya está " +
          "armado. No escribas el link ni ese mensaje a mano, ni lo copies de ningún lado: " +
          "poné el marcador y listo."
        : "(todavía no hay link cargado: no lo inventes, consultalo con consultar_a_la_directora)",
    );
}

/**
 * Busca un tema de estudio en internet, en un pedido APARTE de la charla.
 *
 * Con la búsqueda web adentro de la charla, la API le suma al bot pautas para
 * citar fuentes textualmente, y las aplicaba también a la biblioteca: pegaba
 * oraciones enteras del libro en medio de sus explicaciones. Así, la charla
 * solo recibe un resumen con las fuentes y lo explica con sus palabras.
 */
async function buscarEnInternet(orgId: string, consulta: string): Promise<string> {
  const cliente = getCliente();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: consulta }];
  // Qué buscar y en qué fuentes depende de la materia de la academia.
  const sistema = perfilDeOrg(await getOrganizacion(orgId)).sistemaBusqueda;
  // Sin razonamiento: acá solo hay que buscar y resumir, y el razonamiento
  // se comía el tope de tokens y hacía que tardara más de dos minutos.
  const pedir = () =>
    cliente.messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      thinking: { type: "disabled" },
      system: sistema,
      tools: [BUSQUEDA_WEB],
      messages,
    });

  const partes: string[] = [];
  const fuentes = new Map<string, string>(); // url → título
  const tomar = (r: Anthropic.Message) => {
    for (const b of r.content) {
      if (b.type !== "text") continue;
      partes.push(b.text);
      for (const c of b.citations ?? []) {
        if (c.type === "web_search_result_location") fuentes.set(c.url, c.title ?? c.url);
      }
    }
  };

  let r = await pedir();
  await anotarUso(orgId, r, "busqueda-web");
  tomar(r);
  // La búsqueda corre en los servidores de Anthropic: si tarda, la API pausa
  // el turno ("pause_turn") y hay que devolvérselo tal cual para que siga.
  for (let i = 0; r.stop_reason === "pause_turn" && i < 3; i++) {
    messages.push({ role: "assistant", content: r.content });
    r = await pedir();
    await anotarUso(orgId, r, "busqueda-web");
    tomar(r);
  }

  const resumen = partes.join("").trim();
  if (!resumen || resumen.includes("NO_ENCONTRADO")) {
    return JSON.stringify({
      ok: true,
      encontrado: false,
      mensaje:
        "No se encontró nada confiable en internet. No respondas de memoria: usá " +
        "consultar_a_la_directora.",
    });
  }
  return JSON.stringify({
    ok: true,
    encontrado: true,
    resumen,
    fuentes: [...fuentes].slice(0, 5).map(([url, titulo]) => ({ titulo, url })),
    nota:
      "Explicáselo con tus palabras, aclarale que no sale de la bibliografía de la " +
      "cátedra y nombrale el sitio de donde sale.",
  });
}
