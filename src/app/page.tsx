import Link from "next/link";

import { Brand } from "@/components/brand";
import { checkSupabaseConnection } from "@/lib/supabase/server";

export default async function Home() {
  const isSupabaseConnected = await checkSupabaseConnection();

  return (
    <main className="min-h-screen bg-surface px-6 py-12 sm:py-20">
      <section className="mx-auto flex min-h-[calc(100vh-10rem)] w-full max-w-5xl items-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-border bg-background lg:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col justify-center px-8 py-12 sm:px-12 lg:px-16 lg:py-16">
            <div className="w-fit">
              <Brand size="large" />
            </div>
            <p className="mt-10 max-w-lg text-sm font-semibold uppercase tracking-[0.18em] text-brand-primary">
              Gestão de presença
            </p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight text-brand-secondary sm:text-5xl">
              Reuniões mais organizadas, equipes mais presentes.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              Sistema de gestão de presença em reuniões de imobiliárias.
            </p>
            <div className="mt-10">
              <Link
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-primary px-6 text-sm font-semibold text-white transition hover:bg-brand-primary-hover"
                href="/login"
              >
                Acessar o sistema
              </Link>
            </div>
          </div>

          <div className="flex flex-col justify-between border-t border-border bg-surface p-8 sm:p-12 lg:border-l lg:border-t-0">
            <div>
              <span className="inline-flex rounded-full bg-brand-primary-soft px-3 py-1 text-xs font-semibold text-brand-primary">
                Ambiente seguro
              </span>
              <h2 className="mt-6 text-2xl font-semibold tracking-tight text-brand-secondary">
                Estrutura preparada para sua operação
              </h2>
              <p className="mt-3 leading-7 text-muted-foreground">
                Acesso restrito a usuários autorizados, com autenticação e
                proteção server-side.
              </p>
            </div>

            <div className="mt-12 rounded-2xl border border-border bg-background p-5">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-full bg-brand-primary"
                />
                <div>
                  <p className="text-sm font-semibold text-brand-secondary">
                    Status do ambiente
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Supabase {isSupabaseConnected ? "conectado" : "indisponível"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
