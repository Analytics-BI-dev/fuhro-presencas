"use client";

import { useMemo, useState, useTransition } from "react";

import { saveAttendance } from "@/app/reunioes/actions";
import {
  EmptyState,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "@/components/module-ui";
import type { AttendanceBroker } from "@/lib/meeting-data";

type AttendanceState = Record<string, boolean | null>;

export function AttendancePanel({
  brokers,
  canEdit,
  meetingId,
}: {
  brokers: AttendanceBroker[];
  canEdit: boolean;
  meetingId: string;
}) {
  const [attendance, setAttendance] = useState<AttendanceState>(() =>
    Object.fromEntries(
      brokers.map((broker) => [broker.id, broker.attendance]),
    ),
  );
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [feedback, setFeedback] = useState<{
    message: string;
    ok: boolean;
    warning?: boolean;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const teams = useMemo(() => {
    const options = new Map<string, string>();

    for (const broker of brokers) {
      if (broker.teamId && broker.teamName) {
        options.set(broker.teamId, broker.teamName);
      }
    }

    return [...options.entries()].sort((first, second) =>
      first[1].localeCompare(second[1], "pt-BR"),
    );
  }, [brokers]);
  const filteredBrokers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");

    return brokers.filter((broker) => {
      const matchesName = normalizedSearch
        ? broker.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch)
        : true;
      const matchesTeam = teamFilter
        ? teamFilter === "sem-equipe"
          ? !broker.teamId
          : broker.teamId === teamFilter
        : true;

      return matchesName && matchesTeam;
    });
  }, [brokers, search, teamFilter]);
  const presentCount = brokers.filter(
    (broker) => attendance[broker.id] === true,
  ).length;
  const absentCount = brokers.filter(
    (broker) => attendance[broker.id] === false,
  ).length;
  const unreviewedCount = brokers.length - presentCount - absentCount;
  const percentage =
    brokers.length > 0 ? Math.round((presentCount / brokers.length) * 100) : 0;
  const liveStats = [
    { label: "Corretores", value: brokers.length },
    { label: "Presentes", value: presentCount },
    { label: "Ausentes", value: absentCount },
    { label: "Presença", value: `${percentage}%` },
  ];

  function markAll(value: boolean) {
    setAttendance(
      Object.fromEntries(brokers.map((broker) => [broker.id, value])),
    );
    setFeedback(null);
  }

  function markBroker(brokerId: string, value: boolean) {
    setAttendance((current) => ({ ...current, [brokerId]: value }));
    setFeedback(null);
  }

  function handleSave() {
    const entries = brokers.flatMap((broker) => {
      const value = attendance[broker.id];

      return typeof value === "boolean"
        ? [{ attended: value, brokerId: broker.id }]
        : [];
    });

    startTransition(async () => {
      try {
        const result = await saveAttendance(meetingId, entries);
        setFeedback(result);
      } catch {
        setFeedback({
          message: "Não foi possível salvar a presença. Tente novamente.",
          ok: false,
        });
      }
    });
  }

  if (brokers.length === 0) {
    return (
      <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-background">
        <EmptyState
          description="Cadastre e ative corretores antes de lançar a presença."
          title="Nenhum corretor ativo"
        />
      </section>
    );
  }

  return (
    <section className="mt-6">
      <div
        aria-label="Resumo da presença"
        className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {liveStats.map((stat, index) => (
          <article
            className="rounded-2xl border border-border bg-background p-4 sm:p-5"
            key={stat.label}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-muted-foreground sm:text-sm">
                {stat.label}
              </p>
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${
                  index === 1 ? "bg-emerald-500" : "bg-brand-primary"
                }`}
              />
            </div>
            <p className="mt-3 text-2xl font-semibold text-brand-secondary sm:text-3xl">
              {stat.value}
            </p>
          </article>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-background p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-2 block text-xs font-semibold text-muted-foreground">
                Buscar corretor
              </span>
              <input
                className={inputClassName}
                maxLength={120}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Digite um nome"
                type="search"
                value={search}
              />
            </label>
            <label>
              <span className="mb-2 block text-xs font-semibold text-muted-foreground">
                Filtrar por equipe na data
              </span>
              <select
                className={inputClassName}
                onChange={(event) => setTeamFilter(event.target.value)}
                value={teamFilter}
              >
                <option value="">Todas as equipes</option>
                <option value="sem-equipe">Sem equipe na data</option>
                {teams.map(([teamId, teamName]) => (
                  <option key={teamId} value={teamId}>
                    {teamName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {canEdit ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                className={secondaryButtonClassName}
                onClick={() => markAll(true)}
                type="button"
              >
                Marcar todos como presentes
              </button>
              <button
                className={secondaryButtonClassName}
                onClick={() => markAll(false)}
                type="button"
              >
                Marcar todos como ausentes
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4 text-xs font-semibold">
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">
            {presentCount} presentes
          </span>
          <span className="rounded-full bg-surface-muted px-3 py-1.5 text-brand-secondary">
            {absentCount} ausentes
          </span>
          <span
            className={`rounded-full px-3 py-1.5 ${
              unreviewedCount > 0
                ? "bg-amber-50 text-amber-700"
                : "bg-brand-primary-soft text-brand-primary"
            }`}
          >
            {unreviewedCount} não revisados
          </span>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-background">
        {filteredBrokers.length === 0 ? (
          <EmptyState
            description="Ajuste a busca ou o filtro de equipe."
            title="Nenhum corretor encontrado"
          />
        ) : (
          <div className="divide-y divide-border">
            {filteredBrokers.map((broker) => {
              const value = attendance[broker.id];

              return (
                <article
                  className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.65fr)_auto] sm:items-center sm:px-5"
                  key={broker.id}
                >
                  <div>
                    <h3 className="text-sm font-semibold text-brand-secondary">
                      {broker.name}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                      {broker.teamName ?? "Sem equipe na data"}
                    </p>
                  </div>
                  <p className="hidden text-sm text-muted-foreground sm:block">
                    {broker.teamName ?? "Sem equipe na data"}
                  </p>

                  {canEdit ? (
                    <div
                      aria-label={`Presença de ${broker.name}`}
                      className="grid grid-cols-2 overflow-hidden rounded-xl border border-border"
                      role="group"
                    >
                      <button
                        aria-pressed={value === true}
                        className={`min-h-10 px-3 text-xs font-semibold transition ${
                          value === true
                            ? "bg-emerald-600 text-white"
                            : "bg-background text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700"
                        }`}
                        onClick={() => markBroker(broker.id, true)}
                        type="button"
                      >
                        Presente
                      </button>
                      <button
                        aria-pressed={value === false}
                        className={`min-h-10 border-l border-border px-3 text-xs font-semibold transition ${
                          value === false
                            ? "bg-brand-primary text-white"
                            : "bg-background text-muted-foreground hover:bg-brand-primary-soft hover:text-brand-primary"
                        }`}
                        onClick={() => markBroker(broker.id, false)}
                        type="button"
                      >
                        Ausente
                      </button>
                    </div>
                  ) : (
                    <span
                      className={`inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-xs font-semibold ${
                        value === true
                          ? "bg-emerald-50 text-emerald-700"
                          : value === false
                            ? "bg-brand-primary-soft text-brand-primary"
                            : "bg-surface-muted text-muted-foreground"
                      }`}
                    >
                      {value === true
                        ? "Presente"
                        : value === false
                          ? "Ausente"
                          : "Não revisado"}
                    </span>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {feedback ? (
        <div
          aria-live="polite"
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            feedback.warning
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : feedback.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
          role={feedback.ok ? "status" : "alert"}
        >
          {feedback.message}
        </div>
      ) : null}

      {canEdit ? (
        <div className="sticky bottom-4 mt-4 flex flex-col gap-3 rounded-2xl border border-border bg-background/95 p-4 shadow-[0_12px_36px_rgba(37,41,54,0.10)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {unreviewedCount > 0
              ? `${unreviewedCount} corretores ainda não foram revisados.`
              : "Todos os corretores foram revisados."}
          </p>
          <button
            className={primaryButtonClassName}
            disabled={isPending || presentCount + absentCount === 0}
            onClick={handleSave}
            type="button"
          >
            {isPending ? "Salvando..." : "Salvar presença"}
          </button>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
          Seu perfil possui acesso somente para consulta.
        </p>
      )}
    </section>
  );
}
