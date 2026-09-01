"use client";

import { useState } from "react";
import { Menu, LogOut, PanelLeftClose, PanelLeft } from "lucide-react";
import { Sidebar, useSidebarRail } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type AppShellProps = {
  user: {
    name: string;
    email: string;
    roleName: string;
  };
  children: React.ReactNode;
};

export function AppShell({ user, children }: AppShellProps) {
  const [open, setOpen] = useState(false);
  const { rail, hoverExpanded, onRailChange, onHoverChange } = useSidebarRail();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("Falha ao sair");
      toast.success("Sessão encerrada");
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Não foi possível sair");
      setLoggingOut(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar
        open={open}
        onClose={() => setOpen(false)}
        rail={rail}
        onRailChange={onRailChange}
        hoverExpanded={hoverExpanded}
        onHoverChange={onHoverChange}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-zinc-200 bg-white/90 px-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex"
              onClick={() => onRailChange(!rail)}
              aria-label={rail ? "Expandir menu" : "Recolher menu"}
              title={
                rail
                  ? "Menu recolhido — passe o mouse na lateral para expandir. Clique para fixar aberto."
                  : "Recolher menu (expande ao passar o mouse)"
              }
            >
              {rail ? (
                <PanelLeft className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </Button>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                Olá, {user.name.split(" ")[0]}
              </p>
              <p className="text-xs text-zinc-500">{user.roleName}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <ThemeToggle />
            <div className="hidden text-right md:block">
              <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                {user.email}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              disabled={loggingOut}
              className="gap-1.5"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
