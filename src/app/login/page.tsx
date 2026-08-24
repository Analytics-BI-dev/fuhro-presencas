import type { Metadata } from "next";
import Link from "next/link";

import { Brand } from "@/components/brand";

import { login } from "./actions";

export const metadata: Metadata = {
  title: "Entrar | Fuhro Presenças",
};

const errorMessages: Record<string, string> = {
  "acesso-negado": "Seu usuário não possui acesso ativo ao sistema.",
  "campos-invalidos": "Informe um e-mail e uma senha válidos.",
  "credenciais-invalidas": "E-mail ou senha inválidos.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string | string[] }>;
}) {
  const errorCode = (await searchParams).erro;
  const errorMessage =
    typeof errorCode === "string" ? errorMessages[errorCode] : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5 py-10 sm:px-6">
      <div className="w-full max-w-md">
        <Link
          className="mx-auto block w-fit rounded-xl"
          href="/"
          aria-label="Voltar para a página inicial"
        >
          <Brand centered size="large" showName={false} />
        </Link>

        <section className="mt-7 rounded-3xl border border-border bg-background p-7 sm:p-9">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-primary">
              Acesso restrito
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-brand-secondary">
              Bem-vindo de volta
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Entre com as credenciais fornecidas pelo administrador.
            </p>
          </div>

          {errorMessage ? (
            <p
              className="mt-6 rounded-xl border border-red-100 bg-brand-primary-soft px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}

          <form action={login} className="mt-7 space-y-5">
            <div>
              <label
                className="text-sm font-semibold text-brand-secondary"
                htmlFor="email"
              >
                E-mail
              </label>
              <input
                autoComplete="email"
                className="mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-4 text-foreground outline-none transition placeholder:text-muted-foreground focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10"
                id="email"
                maxLength={254}
                name="email"
                placeholder="seu@email.com"
                required
                type="email"
              />
            </div>

            <div>
              <label
                className="text-sm font-semibold text-brand-secondary"
                htmlFor="password"
              >
                Senha
              </label>
              <input
                autoComplete="current-password"
                className="mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-4 text-foreground outline-none transition focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10"
                id="password"
                maxLength={4096}
                name="password"
                required
                type="password"
              />
            </div>

            <button
              className="min-h-12 w-full rounded-xl bg-brand-primary px-4 text-sm font-semibold text-white transition hover:bg-brand-primary-hover"
              type="submit"
            >
              Entrar
            </button>
          </form>
        </section>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Fuhro Presenças · Ambiente de acesso controlado
        </p>
      </div>
    </main>
  );
}
