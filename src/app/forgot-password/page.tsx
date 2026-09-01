"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PawPrint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setDevToken(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      toast.success(data.message || "Solicitação registrada");
      if (data.token) setDevToken(data.token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 via-white to-amber-50 p-4 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-600 text-white">
            <PawPrint className="h-6 w-6" />
          </div>
          <CardTitle>Recuperar senha</CardTitle>
          <CardDescription>
            Informe o e-mail da conta. Em produção o link será enviado por
            e-mail; no MVP de desenvolvimento o token é exibido na tela.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Enviando…" : "Solicitar redefinição"}
            </Button>
          </form>

          {devToken ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/40">
              <p className="font-medium text-amber-900 dark:text-amber-100">
                Token de desenvolvimento
              </p>
              <p className="mt-1 break-all font-mono">{devToken}</p>
              <Link
                className="mt-2 inline-block text-orange-700 underline dark:text-orange-300"
                href={`/reset-password?token=${devToken}`}
              >
                Ir para redefinir senha
              </Link>
            </div>
          ) : null}

          <p className="mt-6 text-center text-sm">
            <Link href="/login" className="text-orange-700 hover:underline">
              Voltar ao login
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
