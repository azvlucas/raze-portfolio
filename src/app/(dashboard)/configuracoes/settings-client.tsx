"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SettingsClient() {
  const [settings, setSettings] = useState({
    days_to_expiry_alert: 30,
    max_discount_percent_seller: 5,
    max_discount_percent_manager: 20,
    company_timezone: "America/Sao_Paulo",
  });
  const [pwd, setPwd] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/settings");
    const data = await res.json();
    if (res.ok) setSettings((s) => ({ ...s, ...data }));
  }

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, []);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days_to_expiry_alert: settings.days_to_expiry_alert,
          max_discount_percent_seller: settings.max_discount_percent_seller,
          max_discount_percent_manager: settings.max_discount_percent_manager,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar");
      setSettings((s) => ({ ...s, ...data }));
      toast.success("Configurações salvas");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pwd),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      toast.success("Senha alterada");
      setPwd({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div>
      <PageHeader
        title="Configurações"
        description="Alertas de validade, limites de desconto e segurança da conta."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Operação</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveSettings} className="space-y-4">
              <div className="space-y-2">
                <Label>Dias para alerta de validade</Label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={settings.days_to_expiry_alert}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      days_to_expiry_alert: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Desconto máx. vendedor (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={settings.max_discount_percent_seller}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      max_discount_percent_seller: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Desconto máx. gerente (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={settings.max_discount_percent_manager}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      max_discount_percent_manager: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Fuso horário</Label>
                <Input value={settings.company_timezone} disabled />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar configurações"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alterar minha senha</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={changePassword} className="space-y-4">
              <div className="space-y-2">
                <Label>Senha atual</Label>
                <Input
                  type="password"
                  required
                  value={pwd.currentPassword}
                  onChange={(e) =>
                    setPwd((p) => ({
                      ...p,
                      currentPassword: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Nova senha</Label>
                <Input
                  type="password"
                  required
                  minLength={8}
                  value={pwd.newPassword}
                  onChange={(e) =>
                    setPwd((p) => ({ ...p, newPassword: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Confirmar nova senha</Label>
                <Input
                  type="password"
                  required
                  minLength={8}
                  value={pwd.confirmPassword}
                  onChange={(e) =>
                    setPwd((p) => ({
                      ...p,
                      confirmPassword: e.target.value,
                    }))
                  }
                />
              </div>
              <Button type="submit" variant="secondary">
                Atualizar senha
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
