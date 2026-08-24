import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { requireAuthorization } from "@/lib/access";

export const metadata: Metadata = {
  title: "Dashboard | Fuhro Presenças",
};

const kpis = [
  { detail: "Dados disponíveis em breve", label: "Corretores", value: "—" },
  { detail: "Dados disponíveis em breve", label: "Reuniões", value: "—" },
  {
    detail: "Dados disponíveis em breve",
    label: "Presença média",
    value: "—%",
  },
];

export default async function DashboardPage() {
  const { profile } = await requireAuthorization();
  const displayName = profile.name ?? "Usuário";

  return (
    <AppShell
      currentPath="/dashboard"
      pageTitle="Dashboard"
      profile={profile}
    >
      <section>
        <p className="text-sm font-semibold text-brand-primary">Visão geral</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-secondary sm:text-3xl">
          Olá, {displayName}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Acesso autenticado validado. Os indicadores serão preenchidos
          conforme os próximos módulos forem implementados.
        </p>
      </section>

      <section
        aria-label="Indicadores principais"
        className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {kpis.map((kpi) => (
          <article
            className="rounded-2xl border border-border bg-background p-5 sm:p-6"
            key={kpi.label}
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-muted-foreground">
                {kpi.label}
              </p>
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-brand-primary"
              />
            </div>
            <p className="mt-5 text-4xl font-semibold tracking-tight text-brand-secondary">
              {kpi.value}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">{kpi.detail}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <article className="rounded-2xl border border-border bg-background">
          <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
            <div>
              <h3 className="font-semibold text-brand-secondary">
                Próximas reuniões
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Agenda da equipe
              </p>
            </div>
            <span className="rounded-full bg-brand-primary-soft px-3 py-1 text-xs font-semibold text-brand-primary">
              Em breve
            </span>
          </div>
          <div className="flex min-h-44 flex-col items-center justify-center px-6 py-10 text-center">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-primary-soft text-lg font-semibold text-brand-primary"
            >
              ·
            </span>
            <p className="mt-4 text-sm font-semibold text-brand-secondary">
              Nenhuma reunião configurada
            </p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              Este espaço exibirá as próximas reuniões quando o módulo for
              implementado.
            </p>
          </div>
        </article>

        <article className="rounded-2xl border border-border bg-background p-5 sm:p-6">
          <p className="text-sm font-semibold text-brand-secondary">
            Seu acesso
          </p>
          <dl className="mt-5 space-y-4">
            <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
              <dt className="text-sm text-muted-foreground">Perfil</dt>
              <dd className="text-sm font-semibold text-brand-secondary">
                {profile.name ?? "Não informado"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-sm text-muted-foreground">Role</dt>
              <dd className="rounded-full bg-brand-primary-soft px-3 py-1 text-xs font-semibold capitalize text-brand-primary">
                {profile.role}
              </dd>
            </div>
          </dl>
        </article>
      </section>
    </AppShell>
  );
}
