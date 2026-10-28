import { requireUser } from "@/lib/auth";
import { PanelShell } from "@/components/panel/panel-shell";
import { getOrganizacion, marcaDe } from "@/lib/organizacion";
import { esAdminPlataforma } from "@/lib/plataforma-acceso";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  // La marca es la de la academia del usuario, no la del dominio.
  const [org, esPlataforma] = await Promise.all([
    getOrganizacion(user.organizacionId),
    esAdminPlataforma(user.id),
  ]);
  return (
    <PanelShell marca={marcaDe(org)} esPlataforma={esPlataforma} user={user}>
      {children}
    </PanelShell>
  );
}
