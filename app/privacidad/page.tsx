import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { marcaDe, usuarioDeInstagram } from "@/lib/organizacion";
import { requireOrgDeLaPeticion, orgDeLaPeticion } from "@/lib/organizacion-peticion";

/** La política es de la academia del dominio con el que se entra. */
export async function generateMetadata() {
  const org = await orgDeLaPeticion();
  if (!org) return { title: "Academia no encontrada" };
  return {
    title: `Política de privacidad — ${org.nombre}`,
    description: `Qué datos personales guarda ${org.nombre}, para qué los usa, con quién los comparte y cómo pedir que los eliminemos.`,
  };
}

const ULTIMA_ACTUALIZACION = "10 de septiembre de 2026";

function Seccion({
  id,
  titulo,
  children,
}: {
  id?: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="mb-3 font-display text-2xl font-semibold text-ink sm:text-3xl">
        {titulo}
      </h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-ink-soft">
        {children}
      </div>
    </section>
  );
}

function Lista({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-blush-deep">
      {children}
    </ul>
  );
}

const enlace = "font-medium text-blush-deep underline underline-offset-2";

export default async function PrivacidadPage() {
  const org = await requireOrgDeLaPeticion();
  const whatsapp = org.whatsappPublico
    ? `https://wa.me/${org.whatsappPublico.replace(/\D/g, "")}`
    : "";
  const instagram = usuarioDeInstagram(org.instagramUrl);
  const materia = org.materia.trim().toLowerCase();
  return (
    <main className="min-h-screen bg-cream">
      <header className="mx-auto max-w-3xl px-5 pt-8 sm:px-8">
        <Link href="/" aria-label="Volver al inicio">
          <Wordmark marca={marcaDe(org)} />
        </Link>
      </header>

      <article className="mx-auto max-w-3xl space-y-10 px-5 pb-16 pt-10 sm:px-8">
        <div>
          <h1 className="font-display text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            Política de privacidad
          </h1>
          <p className="mt-3 text-sm text-ink-muted">
            Última actualización: {ULTIMA_ACTUALIZACION}
          </p>
          <p className="mt-6 text-[15px] leading-relaxed text-ink-soft">
            Esta página explica qué datos personales guardamos cuando te
            inscribís, tomás clases o nos escribís por WhatsApp, para qué los
            usamos y cómo podés pedir verlos, corregirlos o eliminarlos.
          </p>
        </div>

        <Seccion titulo="Quiénes somos">
          <p>
            {org.nombre} es una academia de clases online
            {materia && ` de ${materia}`} con sede en Argentina
            {org.directora && `, dirigida por ${org.directora}`}. Somos
            responsables de los datos que se describen en esta página.
          </p>
        </Seccion>

        <Seccion titulo="Qué datos guardamos">
          <p>
            <strong className="text-ink">Si te inscribís desde la web:</strong>{" "}
            tu nombre, un medio de contacto, tu carrera, el tema que te
            interesa, si preferís clases grupales o individuales, y el mensaje
            que nos dejes.
          </p>
          <p>
            <strong className="text-ink">Si sos alumno:</strong> tu nombre,
            carrera, email y teléfono; las clases que tomás; el estado de tus
            pagos (si está pago, señado o pendiente, el monto y la fecha); y
            las notas de seguimiento que cargan los profesores sobre tu
            avance.
          </p>
          <p>
            <strong className="text-ink">Si nos escribís por WhatsApp:</strong>{" "}
            tu número y el texto de los mensajes que intercambiamos. Si nos
            mandás el comprobante de un pago (foto o PDF), lo guardamos para
            poder verificarlo. Los comprobantes se guardan en un espacio
            privado:{" "}
            <strong className="text-ink">sólo los ve la dirección</strong>.
          </p>
        </Seccion>

        <Seccion titulo="Para qué los usamos">
          <Lista>
            <li>Coordinar tus clases y avisarte cuándo son.</li>
            <li>Confirmar tus pagos y reservas.</li>
            <li>Preguntarte cómo te fue después de cada clase.</li>
            <li>
              Hacer el seguimiento de tu aprendizaje y reforzar lo que más te
              cuesta.
            </li>
            <li>Responder tus consultas.</li>
          </Lista>
          <p>
            No vendemos tus datos ni los usamos para publicidad de otras
            empresas.
          </p>
        </Seccion>

        <Seccion titulo="Cómo respondemos por WhatsApp">
          <p>
            Para contestarte rápido a cualquier hora, parte de las respuestas
            por WhatsApp las redacta un asistente automático, usando el
            contenido de tu mensaje y la información de la academia. En
            cualquier momento podés pedir hablar con una persona y la
            conversación la sigue la directora.
          </p>
        </Seccion>

        <Seccion titulo="Con quién los compartimos">
          <p>
            Sólo con los servicios que necesitamos para funcionar, y sólo lo
            necesario para cada uno:
          </p>
          <Lista>
            <li>
              <strong className="text-ink">Meta (WhatsApp)</strong>, por donde
              viajan los mensajes que intercambiamos.
            </li>
            <li>
              <strong className="text-ink">Anthropic</strong>, que provee el
              asistente que redacta las respuestas: recibe el texto de la
              conversación para poder contestarla.
            </li>
            <li>
              <strong className="text-ink">Supabase</strong>, donde está
              guardada nuestra base de datos.
            </li>
            <li>
              <strong className="text-ink">Vercel</strong>, que aloja esta
              plataforma.
            </li>
          </Lista>
          <p>
            Algunos de estos servicios tienen sus servidores fuera de
            Argentina, por lo que tus datos pueden almacenarse o procesarse en
            otros países.
          </p>
          <p>
            Los profesores ven sólo lo necesario para dar tus clases.{" "}
            <strong className="text-ink">
              No tienen acceso a tus conversaciones de WhatsApp ni a tus
              comprobantes de pago.
            </strong>
          </p>
        </Seccion>

        <Seccion titulo="Cuánto tiempo los guardamos">
          <p>
            Mientras seas alumno y mientras los necesitemos para coordinar tus
            clases. Podés pedir que los eliminemos antes, en cualquier momento.
          </p>
        </Seccion>

        <Seccion titulo="Tus derechos">
          <p>
            Tenés derecho a pedir acceso a tus datos, corregirlos,
            actualizarlos o eliminarlos. Respondemos los pedidos de acceso en
            un plazo máximo de 10 días corridos, y los de corrección o
            eliminación en un máximo de 5 días hábiles.
          </p>
          <p className="rounded-xl bg-blush-soft/70 p-4 text-sm">
            El titular de los datos personales tiene la facultad de ejercer el
            derecho de acceso a los mismos en forma gratuita a intervalos no
            inferiores a seis meses, salvo que se acredite un interés legítimo
            al efecto conforme lo establecido en el artículo 14, inciso 3 de la
            Ley Nº 25.326. La Agencia de Acceso a la Información Pública, en su
            carácter de Órgano de Control de la Ley Nº 25.326, tiene la
            atribución de atender las denuncias y reclamos que interpongan
            quienes resulten afectados en sus derechos por incumplimiento de
            las normas vigentes en materia de protección de datos personales.
          </p>
        </Seccion>

        <Seccion
          id="eliminar-datos"
          titulo="Cómo pedir que eliminemos tus datos"
        >
          <p>
            Escribinos
            {whatsapp && (
              <>
                {" "}por{" "}
                <a href={whatsapp} className={enlace}>
                  WhatsApp
                </a>
              </>
            )}
            {whatsapp && instagram && " o"}
            {instagram && (
              <>
                {" "}por{" "}
                <a
                  href={org.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={enlace}
                >
                  Instagram (@{instagram})
                </a>
              </>
            )}{" "}
            diciendo que querés que borremos tus datos. Lo gestiona
            personalmente la directora.
          </p>
          <p>
            En un máximo de 5 días hábiles eliminamos tus datos de alumno, tus
            clases, pagos y notas de seguimiento, el historial de tus
            conversaciones con nosotros y los comprobantes que nos hayas
            mandado, y te confirmamos cuando esté hecho.
            Sólo conservaríamos algún dato si una ley nos obligara a hacerlo, y
            en ese caso te lo diríamos.
          </p>
          <p>
            Tené en cuenta que los mensajes que ya intercambiamos también
            quedan guardados en tu propio WhatsApp; esos los podés borrar desde
            tu teléfono.
          </p>
        </Seccion>

        <Seccion titulo="Cambios en esta política">
          <p>
            Si cambiamos algo importante, actualizamos esta página y la fecha
            de arriba.
          </p>
        </Seccion>

        <p className="border-t border-ink/10 pt-6 text-xs text-ink-muted">
          © {new Date().getFullYear()} · {org.nombre}
          {org.directora && ` · Directora: ${org.directora}`}
        </p>
      </article>
    </main>
  );
}
