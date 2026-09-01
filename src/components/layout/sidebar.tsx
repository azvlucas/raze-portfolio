"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Boxes,
  ClipboardList,
  Truck,
  ShoppingCart,
  Users,
  Heart,
  Tag,
  Megaphone,
  BarChart3,
  Trophy,
  FileText,
  Settings,
  UserCog,
  X,
  PawPrint,
  CircleDollarSign,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  ArrowLeftRight,
  LineChart,
  CalendarClock,
  Repeat,
  PieChart,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  children: NavLink[];
};

type NavItem =
  | ({ type: "link" } & NavLink)
  | ({ type: "group" } & NavGroup);

const NAV: NavItem[] = [
  { type: "link", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    type: "group",
    id: "cadastros",
    label: "Cadastros",
    icon: FolderOpen,
    children: [
      { href: "/produtos", label: "Produtos", icon: Package },
      { href: "/fornecedores", label: "Fornecedores", icon: Truck },
      { href: "/clientes", label: "Clientes", icon: Users },
      { href: "/custos-venda", label: "Custos de venda", icon: CircleDollarSign },
      { href: "/cupons", label: "Cupons", icon: Tag },
      { href: "/campanhas", label: "Campanhas", icon: Megaphone },
      { href: "/usuarios", label: "Usuários", icon: UserCog },
    ],
  },
  {
    type: "group",
    id: "movimentacoes",
    label: "Movimentações",
    icon: ArrowLeftRight,
    children: [
      { href: "/estoque", label: "Estoque", icon: Boxes },
      { href: "/controle-validade", label: "Controle de validade", icon: CalendarClock },
      { href: "/inventario", label: "Inventário", icon: ClipboardList },
      { href: "/compras", label: "Compras", icon: ClipboardList },
      { href: "/vendas", label: "Vendas", icon: ShoppingCart },
    ],
  },
  {
    type: "group",
    id: "gestao-assinaturas",
    label: "Gestão Assinaturas",
    icon: Repeat,
    children: [
      {
        href: "/gestao-assinaturas/analise",
        label: "Análise",
        icon: PieChart,
      },
    ],
  },
  {
    type: "group",
    id: "analises",
    label: "Análises",
    icon: LineChart,
    children: [
      { href: "/crm", label: "CRM", icon: Heart },
      { href: "/rankings", label: "Rankings", icon: Trophy },
      { href: "/relatorios", label: "Relatórios", icon: FileText },
    ],
  },
  { type: "link", href: "/configuracoes", label: "Configurações", icon: Settings },
];

const RAIL_KEY = "raze-sidebar-rail";

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function groupHasActive(pathname: string, children: NavLink[]) {
  return children.some((c) => isActivePath(pathname, c.href));
}

function NavLinkItem({
  item,
  pathname,
  onNavigate,
  nested = false,
  compact = false,
}: {
  item: NavLink;
  pathname: string;
  onNavigate: () => void;
  nested?: boolean;
  compact?: boolean;
}) {
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={compact ? item.label : undefined}
      className={cn(
        "flex items-center rounded-lg py-2 text-sm font-medium transition-colors",
        compact ? "justify-center px-2" : nested ? "gap-3 px-3" : "gap-3 px-3",
        active
          ? "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!compact ? <span className="truncate">{item.label}</span> : null}
    </Link>
  );
}

type SidebarProps = {
  open: boolean;
  onClose: () => void;
  /** Desktop: menu recolhido (só ícones); expande no hover */
  rail: boolean;
  onRailChange: (rail: boolean) => void;
  /** Desktop: mouse sobre a área do menu (expande visualmente) */
  hoverExpanded: boolean;
  onHoverChange: (hover: boolean) => void;
};

export function Sidebar({
  open,
  onClose,
  rail,
  onRailChange,
  hoverExpanded,
  onHoverChange,
}: SidebarProps) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // Em desktop, expandido se não estiver em rail OU se o mouse estiver em cima
  const expandedDesktop = !rail || hoverExpanded;
  const compact = rail && !hoverExpanded;

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const item of NAV) {
        if (item.type === "group" && groupHasActive(pathname, item.children)) {
          next[item.id] = true;
        }
      }
      return next;
    });
  }, [pathname]);

  // Ao expandir por hover, garante grupos da rota abertos
  useEffect(() => {
    if (expandedDesktop) {
      setOpenGroups((prev) => {
        const next = { ...prev };
        for (const item of NAV) {
          if (item.type === "group" && groupHasActive(pathname, item.children)) {
            next[item.id] = true;
          }
        }
        return next;
      });
    }
  }, [expandedDesktop, pathname]);

  function toggleGroup(id: string) {
    if (compact) {
      // Em modo compacto, clique no grupo expande o menu
      onHoverChange(true);
      setOpenGroups((prev) => ({ ...prev, [id]: true }));
      return;
    }
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden
      />

      {/* Spacer desktop — reserva a largura do trilho (recolhido) ou menu aberto */}
      <div
        className={cn(
          "hidden shrink-0 transition-[width] duration-200 ease-out lg:block",
          rail ? "w-[4.5rem]" : "w-64",
        )}
        aria-hidden
      />

      <aside
        onMouseEnter={() => {
          if (rail) onHoverChange(true);
        }}
        onMouseLeave={() => {
          if (rail) onHoverChange(false);
        }}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-zinc-200 bg-white shadow-sm transition-[width,transform] duration-200 ease-out dark:border-zinc-800 dark:bg-zinc-950",
          // mobile
          "w-64",
          open ? "translate-x-0" : "-translate-x-full",
          // desktop
          "lg:translate-x-0",
          expandedDesktop ? "lg:w-64 lg:shadow-xl" : "lg:w-[4.5rem] lg:shadow-none",
          rail && hoverExpanded && "lg:z-[60]",
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center gap-2 border-b border-zinc-200 dark:border-zinc-800",
            compact ? "justify-center px-2" : "justify-between px-4",
          )}
        >
          <Link
            href="/dashboard"
            className={cn(
              "flex min-w-0 items-center font-semibold",
              compact ? "justify-center" : "gap-2",
            )}
            title="Raze Pet"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white">
              <PawPrint className="h-5 w-5" />
            </span>
            {!compact ? (
              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm text-zinc-900 dark:text-zinc-50">
                  Raze Pet
                </div>
                <div className="truncate text-[11px] font-normal text-zinc-500">
                  Gestão comercial
                </div>
              </div>
            ) : null}
          </Link>

          {!compact ? (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className="hidden rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 lg:inline-flex dark:hover:bg-zinc-800"
                onClick={() => onRailChange(!rail)}
                aria-label={rail ? "Fixar menu aberto" : "Recolher menu"}
                title={
                  rail
                    ? "Fixar menu aberto"
                    : "Recolher menu (expande ao passar o mouse)"
                }
              >
                {rail ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                className="rounded-lg p-2 hover:bg-zinc-100 lg:hidden dark:hover:bg-zinc-800"
                onClick={onClose}
                aria-label="Fechar menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="sr-only"
              onClick={() => onRailChange(false)}
            >
              Expandir menu
            </button>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-2">
          {NAV.map((item) => {
            if (item.type === "link") {
              return (
                <NavLinkItem
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onNavigate={onClose}
                  compact={compact}
                />
              );
            }

            const expanded =
              !compact &&
              (openGroups[item.id] ?? groupHasActive(pathname, item.children));
            const GroupIcon = item.icon;
            const childActive = groupHasActive(pathname, item.children);

            return (
              <div key={item.id} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(item.id)}
                  title={compact ? item.label : undefined}
                  className={cn(
                    "flex w-full items-center rounded-lg py-2 text-left text-sm font-semibold transition-colors",
                    compact ? "justify-center px-2" : "gap-3 px-3",
                    childActive
                      ? "text-orange-700 dark:text-orange-300"
                      : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900",
                  )}
                  aria-expanded={expanded}
                >
                  <GroupIcon className="h-4 w-4 shrink-0" />
                  {!compact ? (
                    <>
                      <span className="flex-1 truncate">{item.label}</span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-zinc-400 transition-transform",
                          expanded && "rotate-180",
                        )}
                      />
                    </>
                  ) : null}
                </button>
                {expanded ? (
                  <div className="ml-2 space-y-0.5 border-l border-zinc-200 pl-2 dark:border-zinc-800">
                    {item.children.map((child) => (
                      <NavLinkItem
                        key={child.href}
                        item={child}
                        pathname={pathname}
                        onNavigate={onClose}
                        nested
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-zinc-200 p-2 dark:border-zinc-800">
          {compact ? (
            <button
              type="button"
              onClick={() => onRailChange(false)}
              title="Fixar menu aberto"
              className="flex w-full items-center justify-center rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:bg-zinc-900">
              <BarChart3 className="h-3.5 w-3.5 shrink-0 text-orange-600" />
              <span className="truncate">Raze Pet</span>
              <button
                type="button"
                className="ml-auto hidden rounded p-1 hover:bg-zinc-200 lg:inline-flex dark:hover:bg-zinc-800"
                onClick={() => onRailChange(true)}
                title="Recolher menu (expande no hover)"
                aria-label="Recolher menu"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

/** Preferência de menu recolhido (desktop) */
export function useSidebarRail() {
  const [rail, setRail] = useState(false);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RAIL_KEY);
      if (saved === "1") setRail(true);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  function onRailChange(value: boolean) {
    setRail(value);
    if (!value) setHoverExpanded(false);
    try {
      localStorage.setItem(RAIL_KEY, value ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  return {
    rail: ready ? rail : false,
    hoverExpanded,
    onRailChange,
    onHoverChange: setHoverExpanded,
  };
}
