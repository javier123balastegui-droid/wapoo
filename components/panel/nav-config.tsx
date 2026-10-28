import {
  LayoutDashboard,
  Library,
  CalendarDays,
  CalendarOff,
  GraduationCap,
  BookOpen,
  Inbox,
  UserPlus,
  Wallet,
  UsersRound,
  MessagesSquare,
  Building2,
  type LucideIcon,
} from "lucide-react";
import type { Rol } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Rol[];
  /** Solo para los administradores de la plataforma (no de una academia). */
  soloPlataforma?: boolean;
}

/** Menú del panel. Cada ítem declara qué roles lo ven. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/panel", label: "Inicio", icon: LayoutDashboard, roles: ["ADMIN", "PROFE"] },
  { href: "/panel/agenda", label: "Agenda", icon: CalendarDays, roles: ["ADMIN", "PROFE"] },
  { href: "/panel/alumnos", label: "Alumnos", icon: GraduationCap, roles: ["ADMIN", "PROFE"] },
  { href: "/panel/temario", label: "Temario", icon: BookOpen, roles: ["ADMIN", "PROFE"] },
  { href: "/panel/solicitudes", label: "Solicitudes", icon: Inbox, roles: ["ADMIN"] },
  { href: "/panel/pedidos", label: "Pedidos", icon: UserPlus, roles: ["ADMIN"] },
  { href: "/panel/finanzas", label: "Finanzas", icon: Wallet, roles: ["ADMIN"] },
  { href: "/panel/equipo", label: "Equipo", icon: UsersRound, roles: ["ADMIN"] },
  { href: "/panel/carreras", label: "Carreras", icon: GraduationCap, roles: ["ADMIN"] },
  { href: "/panel/dias-sin-clase", label: "Días sin clase", icon: CalendarOff, roles: ["ADMIN"] },
  { href: "/panel/biblioteca", label: "Biblioteca", icon: Library, roles: ["ADMIN"] },
  { href: "/panel/bot", label: "Bot", icon: MessagesSquare, roles: ["ADMIN"] },
  { href: "/panel/plataforma", label: "Plataforma", icon: Building2, roles: ["ADMIN", "PROFE"], soloPlataforma: true },
];
