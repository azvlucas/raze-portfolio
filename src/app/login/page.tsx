import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 via-white to-amber-50 p-4 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-200/40 via-transparent to-transparent dark:from-orange-900/20" />
      <Suspense fallback={<div className="text-sm text-zinc-500">Carregando...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
