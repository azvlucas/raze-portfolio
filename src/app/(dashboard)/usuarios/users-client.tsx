"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatDateTimeBR } from "@/lib/date";
import { Plus, Pencil, Ban } from "lucide-react";

type Role = { id: string; code: string; name: string; permissions?: string[] };
type User = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  lastLoginAt: string | null;
  role: Role;
};

export function UsersClient() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    roleId: "",
    active: true,
  });

  async function load() {
    const [uRes, rRes] = await Promise.all([
      fetch("/api/users"),
      fetch("/api/users/roles"),
    ]);
    const uData = await uRes.json();
    const rData = await rRes.json();
    if (!uRes.ok) {
      toast.error(uData.error || "Sem permissão para gerenciar usuários");
      return;
    }
    setUsers(uData);
    if (rRes.ok) {
      setRoles(rData);
      if (!form.roleId && rData[0]) {
        setForm((f) => ({ ...f, roleId: rData[0].id }));
      }
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      email: "",
      password: "",
      roleId: roles[0]?.id || "",
      active: true,
    });
    setOpen(true);
  }

  function openEdit(u: User) {
    setEditing(u);
    setForm({
      name: u.name,
      email: u.email,
      password: "",
      roleId: u.role.id,
      active: u.active,
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editing) {
        const res = await fetch(`/api/users/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            roleId: form.roleId,
            active: form.active,
            password: form.password || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro");
        toast.success("Usuário atualizado");
      } else {
        if (!form.password || form.password.length < 8) {
          toast.error("Senha deve ter ao menos 8 caracteres");
          return;
        }
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro");
        toast.success("Usuário criado");
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function deactivate(u: User) {
    if (!confirm(`Inativar ${u.name}?`)) return;
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erro");
      return;
    }
    toast.success("Usuário inativado");
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Usuários e permissões"
        description="Perfis: Administrador, Gerente, Vendedor e Estoquista."
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo usuário
          </Button>
        }
      />

      <Table>
        <THead>
          <TR>
            <TH>Nome</TH>
            <TH>E-mail</TH>
            <TH>Perfil</TH>
            <TH>Último acesso</TH>
            <TH>Status</TH>
            <TH></TH>
          </TR>
        </THead>
        <TBody>
          {!users.length ? (
            <TR>
              <TD colSpan={6} className="py-8 text-center text-zinc-500">
                Nenhum usuário ou sem permissão
              </TD>
            </TR>
          ) : (
            users.map((u) => (
              <TR key={u.id} className={!u.active ? "opacity-60" : undefined}>
                <TD className="font-medium">{u.name}</TD>
                <TD className="text-sm">{u.email}</TD>
                <TD>
                  <Badge variant="muted">{u.role.name}</Badge>
                </TD>
                <TD className="text-xs">
                  {formatDateTimeBR(u.lastLoginAt)}
                </TD>
                <TD>
                  <Badge variant={u.active ? "success" : "muted"}>
                    {u.active ? "Ativo" : "Inativo"}
                  </Badge>
                </TD>
                <TD className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openEdit(u)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {u.active ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deactivate(u)}
                    >
                      <Ban className="h-4 w-4 text-red-500" />
                    </Button>
                  ) : null}
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      {roles.length ? (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Perfis de acesso</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {roles.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-zinc-500">{r.code}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  {(r.permissions || []).length} permissões
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar usuário" : "Novo usuário"}
      >
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input
              required
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>E-mail *</Label>
            <Input
              type="email"
              required
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>
              {editing ? "Nova senha (opcional)" : "Senha *"}
            </Label>
            <Input
              type="password"
              minLength={editing ? undefined : 8}
              required={!editing}
              value={form.password}
              onChange={(e) =>
                setForm((f) => ({ ...f, password: e.target.value }))
              }
              placeholder={editing ? "Deixe em branco para manter" : ""}
            />
          </div>
          <div className="space-y-2">
            <Label>Perfil *</Label>
            <Select
              required
              value={form.roleId}
              onChange={(e) =>
                setForm((f) => ({ ...f, roleId: e.target.value }))
              }
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) =>
                setForm((f) => ({ ...f, active: e.target.checked }))
              }
            />
            Ativo
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
