"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, LogOut } from "lucide-react";
import { Wordmark, type Marca } from "@/components/brand/wordmark";
import { NAV_ITEMS, type NavItem } from "./nav-config";
import { logoutAction } from "@/app/actions/auth";
import { cn, iniciales } from "@/lib/utils";
import type { SessionUser } from "@/lib/types";

export function PanelShell({
  marca,
  esPlataforma = false,
  user,
  children,
}: {
  marca: Marca;
  /** Ve también la administración de la plataforma. */
  esPlataforma?: boolean;
  user: SessionUser;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  // Con useMemo para que la lista no se recree en cada render: si se recreara,
  // el efecto de precarga de abajo se dispararía una y otra vez.
  const items = useMemo(
    () =>
      NAV_ITEMS.filter(
        (i) => i.roles.includes(user.rol) && (!i.soloPlataforma || esPlataforma),
      ),
    [user.rol, esPlataforma],
  );

  // Precarga de las secciones del menú.
  //
  // Next precarga un enlace recién cuando aparece en pantalla. En la
  // computadora el menú está siempre a la vista, así que eso pasa solo; pero en
  // el celular el menú vive en un cajón cerrado (display:none), nunca entra en
  // pantalla y nunca se precarga nada. Por eso ahí, al tocar una sección, la
  // pantalla de carga aparecía recién cuando contestaba el servidor, en vez de
  // al instante.
  //
  // Pidiéndolas a mano, el navegador se guarda la pantalla de carga de cada
  // sección y el toque responde enseguida. Es barato: de una ruta dinámica solo
  // se trae ese esqueleto, no los datos.
  useEffect(() => {
    // Si el teléfono está en modo ahorro de datos, no se adelanta nada.
    const conexion = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    if (conexion?.saveData) return;

    for (const item of items) router.prefetch(item.href);
  }, [router, items]);

  return (
    <div className="min-h-screen lg:flex">
      {/* — Sidebar fijo (escritorio) — */}
      {/* overflow-y-auto: con la ventana baja, el menú no entra entero y sin
          esto los últimos ítems quedaban cortados, sin forma de llegar. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 overflow-y-auto border-r border-line bg-cream lg:flex lg:flex-col">
        <SidebarContent items={items} marca={marca} user={user} onNavigate={() => {}} />
      </aside>

      {/* — Columna principal — */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
        {/* Header (celular) */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-cream/85 px-4 py-3 backdrop-blur lg:hidden">
          <button
            onClick={() => setOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-full text-ink-soft transition-colors hover:bg-blush-soft/60"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Wordmark marca={marca} />
          <span className="grid h-9 w-9 place-items-center rounded-full bg-blush-soft text-xs font-semibold text-blush-deep">
            {iniciales(user.nombre)}
          </span>
        </header>

        <main className="flex-1 px-5 py-8 sm:px-8 lg:px-12">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>

      {/* — Drawer (celular) — */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[82%] flex-col overflow-y-auto bg-surface shadow-lift">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-blush-soft/60"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent
              items={items}
              marca={marca}
              user={user}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarContent({
  items,
  marca,
  user,
  onNavigate,
}: {
  items: NavItem[];
  marca: Marca;
  user: SessionUser;
  onNavigate: () => void;
}) {
  const pathname = usePathname() ?? "";

  return (
    <div className="flex h-full flex-col gap-2 p-5">
      <Link href="/panel" onClick={onNavigate} className="px-2 py-3">
        <Wordmark marca={marca} />
      </Link>

      <nav className="mt-2 flex flex-1 flex-col gap-1">
        {items.map((item) => {
          const active =
            item.href === "/panel"
              ? pathname === "/panel"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-blush-soft/80 text-ink"
                  : "text-ink-soft hover:bg-blush-soft/40 hover:text-ink",
              )}
            >
              <span
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-xl transition-colors",
                  active
                    ? "bg-surface text-blush-deep shadow-soft"
                    : "text-ink-muted group-hover:text-blush-deep",
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </span>
              {item.label}
              {active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blush-deep" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="rounded-2xl border border-line bg-surface-rose/60 p-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-blush-soft text-sm font-semibold text-blush-deep">
            {iniciales(user.nombre)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">
              {user.nombre}
            </p>
            <p className="truncate text-xs text-ink-muted">
              {user.rol === "ADMIN" ? "Administración" : "Profesor/a"}
            </p>
          </div>
        </div>
        <form action={logoutAction} className="mt-3">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-soft transition-colors hover:border-blush-deep/40 hover:text-ink"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
