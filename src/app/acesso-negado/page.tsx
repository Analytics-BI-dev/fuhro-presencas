import type { Metadata } from "next";
import Link from "next/link";

import { logout } from "@/app/dashboard/actions";
import { Brand } from "@/components/brand";
import {
  primaryButtonClassName,
  secondaryButtonClassName,
} from "@/components/module-ui";

export const metadata: Metadata = {
  title: "Acesso negado | Fuhro Presenças",
};

const reasonMessages: Record<string, string> = {
  "perfil-inativo": "Seu perfil está inativo. Procure um administrador.",
  "perfil-inexistente":
    "Seu usuário autenticado não possui um profile válido no sistema.",
  "role-invalida": "O seu profile não possui uma role válida para o sistema.",
  "sem-imobiliaria": "Nenhuma imobiliária foi atribuída ao seu usuário.",
};

export default async function AccessDeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string | string[] }>;
}) {
  const reason = (await searchParams).motivo;
  const message =
    typeof reason === "string" && reasonMessages[reason]
      ? reasonMessages[reason]
      : "Seu usuário não possui autorização para acessar esta área.";

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5 py-10 sm:px-6">
      <section className="w-full max-w-lg rounded-3xl border border-border bg-background p-7 text-center sm:p-10">
        <div className="mx-auto w-fit">
          <Brand centered size="regular" />
        </div>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-brand-primary">
          Acesso restrito
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-brand-secondary">
          Acesso negado
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {message}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link className={secondaryButtonClassName} href="/">
            Voltar ao início
          </Link>
          <form action={logout}>
            <button className={primaryButtonClassName} type="submit">
              Sair e entrar novamente
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
