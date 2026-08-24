import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import {
  EmptyState,
  FlashMessage,
  inputClassName,
  secondaryButtonClassName,
} from "@/components/module-ui";
import { requireAuthorization } from "@/lib/access";
import { loadAttendanceHistory } from "@/lib/history-data";
import { formatMeetingDate } from "@/lib/meeting-data";

export const metadata: Metadata = {
  title: "Histórico | Fuhro Presenças",
};

type PageSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function readParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

function PresenceBadge({ attended }: { attended: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        attended
          ? "bg-emerald-50 text-emerald-700"
          : "bg-brand-primary-soft text-brand-primary"
      }`}
    >
      {attended ? "Presente" : "Ausente"}
    </span>
  );
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const [context, params] = await Promise.all([
    requireAuthorization(),
    searchParams,
  ]);
  const result = await loadAttendanceHistory(
    context.supabase,
    context.agency.id,
  );
  const search = readParam(params, "busca");
  const resultFilter = readParam(params, "resultado");
  const normalizedSearch = search.toLocaleLowerCase("pt-BR");
  const entries = result.data.filter((entry) => {
    const matchesSearch = normalizedSearch
      ? [entry.brokerName, entry.brokerKsiId, entry.meetingTitle, entry.teamName]
          .filter(Boolean)
          .some((value) =>
            value?.toLocaleLowerCase("pt-BR").includes(normalizedSearch),
          )
      : true;
    const matchesResult =
      resultFilter === "presentes"
        ? entry.attended
        : resultFilter === "ausentes"
          ? !entry.attended
          : true;

    return matchesSearch && matchesResult;
  });
  const filtersAreActive = Boolean(search || resultFilter);

  return (
    <AppShell
      currentPath="/historico"
      pageTitle="Histórico"
      profile={context.profile}
    >
      <section>
        <p className="text-sm font-semibold text-brand-primary">
          {context.agency.name}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-secondary sm:text-3xl">
          Histórico de presença
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Consulte os registros salvos e a equipe atribuída ao corretor no
          momento de cada reunião.
        </p>
      </section>

      {result.error ? <FlashMessage message={result.error} type="error" /> : null}

      <form className="mt-6 grid gap-3 rounded-2xl border border-border bg-background p-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <label>
          <span className="sr-only">Buscar no histórico</span>
          <input
            className={inputClassName}
            defaultValue={search}
            maxLength={120}
            name="busca"
            placeholder="Buscar corretor, equipe ou reunião"
            type="search"
          />
        </label>
        <label>
          <span className="sr-only">Filtrar por resultado</span>
          <select
            className={inputClassName}
            defaultValue={resultFilter}
            name="resultado"
          >
            <option value="">Todos os resultados</option>
            <option value="presentes">Presentes</option>
            <option value="ausentes">Ausentes</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button className={secondaryButtonClassName} type="submit">
            Filtrar
          </button>
          {filtersAreActive ? (
            <Link
              className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-muted-foreground transition hover:text-brand-primary"
              href="/historico"
            >
              Limpar
            </Link>
          ) : null}
        </div>
      </form>

      <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-background">
        {entries.length === 0 && !result.error ? (
          <EmptyState
            description={
              filtersAreActive
                ? "Ajuste a busca ou os filtros para ver outros resultados."
                : "Os lançamentos salvos aparecerão aqui."
            }
            title={
              filtersAreActive
                ? "Nenhum registro encontrado"
                : "Nenhuma presença registrada"
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead className="bg-surface text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Data</th>
                    <th className="px-5 py-4 font-semibold">Reunião</th>
                    <th className="px-5 py-4 font-semibold">Corretor</th>
                    <th className="px-5 py-4 font-semibold">Equipe histórica</th>
                    <th className="px-5 py-4 font-semibold">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entries.map((entry) => (
                    <tr className="transition hover:bg-surface/70" key={entry.id}>
                      <td className="px-5 py-4 text-sm text-muted-foreground">
                        {formatMeetingDate(entry.meetingDate)}
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-brand-secondary">
                        {entry.meetingTitle ?? "Reunião sem título"}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-brand-secondary">
                          {entry.brokerName}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          ID KSI: {entry.brokerKsiId ?? "—"}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">
                        {entry.teamName ?? "Sem equipe registrada"}
                      </td>
                      <td className="px-5 py-4">
                        <PresenceBadge attended={entry.attended} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border md:hidden">
              {entries.map((entry) => (
                <article className="p-4" key={entry.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {formatMeetingDate(entry.meetingDate)}
                      </p>
                      <h3 className="mt-1 font-semibold text-brand-secondary">
                        {entry.brokerName}
                      </h3>
                    </div>
                    <PresenceBadge attended={entry.attended} />
                  </div>
                  <dl className="mt-4 grid gap-2 rounded-xl bg-surface p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Reunião</dt>
                      <dd className="text-right font-semibold text-brand-secondary">
                        {entry.meetingTitle ?? "Sem título"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Equipe histórica</dt>
                      <dd className="text-right font-semibold text-brand-secondary">
                        {entry.teamName ?? "Sem equipe registrada"}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
