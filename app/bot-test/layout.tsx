import { requireUser } from "@/lib/auth";

/**
 * Protege la pantalla de prueba del bot: solo el equipo puede entrar.
 *
 * Va como layout (server component) para no tener que partir en dos la página,
 * que es un componente cliente. Si no hay sesión, `requireUser` redirige al
 * login y la pantalla nunca se renderiza.
 *
 * Ojo: esto protege la PANTALLA. El endpoint que gasta API de Claude se protege
 * aparte, en app/api/bot/route.ts (una pantalla protegida no alcanza: al
 * endpoint se le puede pegar directo).
 */
export default async function BotTestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return <>{children}</>;
}
