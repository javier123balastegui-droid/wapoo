import Link from "next/link";
import Image from "next/image";
import {
  Users,
  BookOpen,
  GraduationCap,
  Video,
  ArrowRight,
  LogIn,
} from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { IconoInstagram } from "@/components/brand/icono-instagram";
import { buttonVariants } from "@/components/ui/button";
import { InscripcionForm } from "@/components/public/inscripcion-form";
import { carrerasActivas } from "@/lib/carreras";
import { marcaDe, usuarioDeInstagram, type Organizacion } from "@/lib/organizacion";
import { requireOrgDeLaPeticion, orgDeLaPeticion } from "@/lib/organizacion-peticion";

/** La web pública es de la academia del dominio con el que se entra. */
export async function generateMetadata() {
  const org = await orgDeLaPeticion();
  if (!org) return { title: "Academia no encontrada" };
  const materia = materiaDe(org);
  return {
    title: `${org.nombre} — Clases de ${materia} online`,
    description:
      `Clases en vivo de ${materia}, grupales o individuales, con material propio y seguimiento.` +
      (org.directora ? ` Dirigido por ${org.directora}.` : "") +
      " Inscribite y coordinamos tu primera clase.",
  };
}

/** "Anatomía" → "anatomía", para usarla en medio de una frase. */
function materiaDe(org: Organizacion): string {
  return org.materia.trim().toLowerCase() || "apoyo escolar";
}

/** Ilustraciones decorativas propias de cada academia, por slug. Las que no
 *  tienen, simplemente no las muestran. */
const ILUSTRACION_INSCRIPCION: Record<string, { src: string; alt: string }> = {};

function Hero({ org }: { org: Organizacion }) {
  if (!org.logoUrl) return null;
  return (
    <div className="pointer-events-none relative hidden h-[30rem] w-[30rem] justify-self-center lg:block">
      <div className="absolute inset-2 rounded-full bg-gradient-to-br from-cream/90 via-blush-soft/60 to-beige/40 shadow-lift" />
      <Image
        src={org.logoUrl}
        alt={`Logo ${org.nombre}`}
        fill
        sizes="480px"
        unoptimized={/^https?:/.test(org.logoUrl)}
        className="scale-150 object-contain p-16 drop-shadow-lg"
        priority
      />
    </div>
  );
}

const FEATURES = [
  {
    icon: Video,
    titulo: "Clases en vivo, online",
    texto:
      "Aprendés desde donde estés, con un profesor que te guía en tiempo real.",
  },
  {
    icon: Users,
    titulo: "Grupales o individuales",
    texto: "Elegís el formato que mejor te funciona, a tu ritmo.",
  },
  {
    icon: BookOpen,
    titulo: "Material y temario propio",
    texto:
      "Todos los profesores siguen el mismo programa, con material diseñado para facilitar la comprensión.",
  },
  {
    icon: GraduationCap,
    titulo: "Seguimiento personalizado",
    texto: "Registramos tu evolución para reforzar lo que más te cuesta.",
  },
];

export default async function LandingPage() {
  const org = await requireOrgDeLaPeticion();
  const marca = marcaDe(org);
  const materia = materiaDe(org);
  const instagram = usuarioDeInstagram(org.instagramUrl);
  const ilustracion = ILUSTRACION_INSCRIPCION[org.slug];
  return (
    <main className="min-h-screen">
      {/* Barra superior */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Wordmark marca={marca} light />
        <div className="flex items-center gap-2">
          {org.instagramUrl && (
            <a
              href={org.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Instagram de ${org.nombre}`}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-white/10 text-cream transition-colors hover:bg-white/20"
            >
              <IconoInstagram className="h-4 w-4" />
            </a>
          )}
          <Link
            href="/alumno"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-white/20"
          >
            <GraduationCap className="h-4 w-4" /> Soy alumno
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-white/20"
          >
            <LogIn className="h-4 w-4" /> Acceso equipo
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-8 pt-10 sm:px-8 sm:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-cream/90 ring-1 ring-white/20">
            Clases online de {materia}
          </p>
          <h1 className="font-display text-5xl font-semibold leading-[1.1] text-cream sm:text-6xl">
            Aprendé {materia}{" "}
            <span className="italic text-[#f3d9a6]">más rápido</span> y en{" "}
            <span className="italic text-[#f3d9a6]">menos tiempo</span>.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-cream/85">
            Un método claro, clases en vivo y seguimiento personalizado para que
            aproveches cada minuto y rindas con confianza.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#inscribite"
              className={buttonVariants({ variant: "solid", size: "lg" })}
            >
              Inscribite <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#info"
              className="inline-flex h-12 items-center rounded-full border border-white/25 bg-white/10 px-6 text-base font-medium text-cream transition-colors hover:bg-white/20"
            >
              Más información
            </a>
          </div>
          </div>
          <Hero org={org} />
        </div>
      </section>

      {/* Features */}
      <section id="info" className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.titulo}
                className="rounded-3xl border border-line bg-surface p-6 shadow-card"
              >
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blush-soft/70 text-blush-deep">
                  <Icon className="h-6 w-6" strokeWidth={1.75} />
                </span>
                <h3 className="mt-4 font-display text-xl font-semibold text-ink">
                  {f.titulo}
                </h3>
                <p className="mt-1.5 text-sm text-ink-soft">{f.texto}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Inscripción */}
      <section id="inscribite" className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="font-display text-4xl font-semibold text-cream">
              Inscribite o pedí información
            </h2>
            <p className="mt-4 text-lg text-cream/85">
              Dejá tus datos y nos comunicamos con vos para coordinar tu primera
              clase. Es rápido: no necesitás cuenta ni contraseña.
            </p>
            <ul className="mt-6 space-y-3 text-cream/90">
              {[
                "Respondemos rápido por email o WhatsApp.",
                "Vos elegís el tema y la modalidad.",
                "Sin compromiso: primero charlamos.",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#f3d9a6]" />
                  {t}
                </li>
              ))}
            </ul>
            {ilustracion && (
              <div className="relative mt-8 hidden h-96 lg:block">
                <Image
                  src={ilustracion.src}
                  alt={ilustracion.alt}
                  fill
                  sizes="384px"
                  className="object-contain object-left"
                />
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-line bg-surface p-6 shadow-lift sm:p-8">
            <InscripcionForm carreras={await carrerasActivas(org.id).catch(() => [])} />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/20 pt-6 sm:flex-row">
          <Wordmark marca={marca} light />
          {instagram && (
            <a
              href={org.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-white/20"
            >
              <IconoInstagram className="h-4 w-4" />@{instagram}
            </a>
          )}
          <p className="text-xs text-cream/70">
            © {new Date().getFullYear()} · {org.nombre}
            {org.directora && ` · Directora: ${org.directora}`} ·{" "}
            <Link
              href="/privacidad"
              className="underline underline-offset-2 hover:text-cream"
            >
              Privacidad
            </Link>
          </p>
        </div>
      </footer>
    </main>
  );
}
