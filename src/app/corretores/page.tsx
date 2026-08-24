import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { BrokerStatusToggle } from "@/components/broker-status-toggle";
import {
  EmptyState,
  Field,
  FlashMessage,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
  StatusBadge,
} from "@/components/module-ui";
import { SubmitButton } from "@/components/submit-button";
import { requireAuthorization } from "@/lib/access";
import {
  loadBrokers,
  type BrokerListItem,
  type TeamListItem,
} from "@/lib/directory-data";

import { createBroker, updateBroker } from "./actions";

export const metadata: Metadata = {
  title: "Corretores | Fuhro Presenças",
};

type PageSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

const errorMessages: Record<string, string> = {
  "corretor-invalido":
    "O corretor informado não está disponível para edição.",
  "equipe-invalida":
    "Selecione uma equipe válida da imobiliária atual.",
  "nao-foi-possivel-salvar":
    "Não foi possível salvar o corretor. Revise os dados e tente novamente.",
  "nao-foi-possivel-alterar-status":
    "Não foi possível alterar o status do corretor. Tente novamente.",
  "nao-foi-possivel-vincular":
    "Não foi possível atualizar a equipe sem comprometer o histórico. Tente novamente.",
  "nome-obrigatorio": "Informe um nome válido para o corretor.",
  "id-ksi-obrigatorio": "Informe o ID KSI do corretor.",
  "sem-permissao": "Seu perfil não possui permissão para esta operação.",
};

const successMessages: Record<string, string> = {
  "corretor-atualizado": "Corretor atualizado com sucesso.",
  "corretor-ativado": "Corretor ativado com sucesso.",
  "corretor-criado": "Corretor cadastrado com sucesso.",
  "corretor-inativado": "Corretor inativado com sucesso.",
};

function readParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];

  return typeof value === "string" ? value : "";
}

function BrokerForm({
  broker,
  canToggleStatus,
  teams,
}: {
  broker?: BrokerListItem;
  canToggleStatus: boolean;
  teams: TeamListItem[];
}) {
  const isEditing = Boolean(broker);

  return (
    <form
      action={isEditing ? updateBroker : createBroker}
      className="mt-6 space-y-5"
    >
      {broker ? (
        <input name="corretor_id" type="hidden" value={broker.id} />
      ) : null}

      <Field label="Nome completo">
        <input
          autoComplete="name"
          autoFocus
          className={inputClassName}
          defaultValue={broker?.name ?? ""}
          maxLength={180}
          name="nome"
          placeholder="Nome do corretor"
          required
        />
      </Field>

      <Field label="ID KSI">
        <input
          autoComplete="off"
          className={inputClassName}
          defaultValue={broker?.ksiId ?? ""}
          maxLength={100}
          name="id_ksi"
          placeholder="Identificador no KSI"
          required
        />
      </Field>

      <Field label={isEditing ? "Equipe atual" : "Equipe inicial"}>
        <select
          className={inputClassName}
          defaultValue={broker?.currentTeamId ?? "sem-equipe"}
          name="equipe_id"
        >
          <option value="sem-equipe">Sem equipe</option>
          {teams.map((team) => (
            <option
              disabled={!team.active && team.id !== broker?.currentTeamId}
              key={team.id}
              value={team.id}
            >
              {team.name}{!team.active ? " (inativa)" : ""}
            </option>
          ))}
        </select>
      </Field>

      {canToggleStatus ? (
        <label className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <input
            className="mt-0.5 h-4 w-4 accent-brand-primary"
            defaultChecked={broker?.active ?? true}
            name="ativo"
            type="checkbox"
          />
          <span>
            <span className="block text-sm font-semibold text-brand-secondary">
              Corretor ativo
            </span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              A inativação preserva o cadastro e todo o histórico de equipes.
            </span>
          </span>
        </label>
      ) : (
        <p className="rounded-xl bg-surface px-4 py-3 text-xs leading-5 text-muted-foreground">
          Seu perfil possui acesso somente para consulta.
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Link className={secondaryButtonClassName} href="/corretores">
          Cancelar
        </Link>
        <SubmitButton
          label={isEditing ? "Salvar alterações" : "Cadastrar corretor"}
        />
      </div>
    </form>
  );
}

function AttendanceSummary({ broker }: { broker: BrokerListItem }) {
  if (broker.attendancePercentage === null) {
    return <span className="text-sm text-muted-foreground">Sem registros</span>;
  }

  return (
    <div>
      <p className="text-sm font-semibold text-brand-secondary">
        {broker.attendancePercentage}% de presença
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {broker.presentCount} presente{broker.presentCount === 1 ? "" : "s"} ·{" "}
        {broker.absentCount} ausente{broker.absentCount === 1 ? "" : "s"} ·{" "}
        {broker.attendanceCount} reuni{broker.attendanceCount === 1 ? "ão" : "ões"}
      </p>
    </div>
  );
}

export default async function BrokersPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const [context, params] = await Promise.all([
    requireAuthorization(),
    searchParams,
  ]);
  const result = await loadBrokers(context.supabase, context.agency.id);
  const search = readParam(params, "busca").trim().slice(0, 120);
  const teamFilter = readParam(params, "equipe");
  const statusFilter = readParam(params, "status");
  const action = readParam(params, "acao");
  const editId = readParam(params, "editar");
  const errorCode = readParam(params, "erro");
  const successCode = readParam(params, "sucesso");
  const normalizedSearch = search.toLocaleLowerCase("pt-BR");
  const filteredBrokers = result.data.brokers.filter((broker) => {
    const matchesSearch = normalizedSearch
      ? broker.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch)
      : true;
    const matchesTeam = teamFilter
      ? teamFilter === "sem-equipe"
        ? !broker.currentTeamId
        : broker.currentTeamId === teamFilter
      : true;
    const matchesStatus =
      statusFilter === "ativos"
        ? broker.active
        : statusFilter === "inativos"
          ? !broker.active
          : true;

    return matchesSearch && matchesTeam && matchesStatus;
  });
  const brokerToEdit = editId
    ? result.data.brokers.find((broker) => broker.id === editId)
    : undefined;
  const showNewForm = action === "novo" && context.permissions.canCreate;
  const showEditForm = Boolean(brokerToEdit && context.permissions.canEdit);
  const filtersAreActive = Boolean(search || teamFilter || statusFilter);

  return (
    <AppShell
      currentPath="/corretores"
      pageTitle="Corretores"
      profile={context.profile}
    >
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-primary">
            {context.agency.name}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-secondary sm:text-3xl">
            Corretores
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Consulte os corretores e gerencie a equipe atual sem perder o
            histórico de vínculos.
          </p>
        </div>

        {context.permissions.canCreate ? (
          <Link className={primaryButtonClassName} href="/corretores?acao=novo">
            Novo corretor
          </Link>
        ) : null}
      </section>

      {successCode && successMessages[successCode] ? (
        <FlashMessage message={successMessages[successCode]} type="success" />
      ) : null}
      {errorCode && errorMessages[errorCode] && !showNewForm && !showEditForm ? (
        <FlashMessage message={errorMessages[errorCode]} type="error" />
      ) : null}
      {result.error ? <FlashMessage message={result.error} type="error" /> : null}

      <form className="mt-6 grid gap-3 rounded-2xl border border-border bg-background p-4 md:grid-cols-[minmax(0,1.5fr)_minmax(12rem,1fr)_minmax(10rem,0.7fr)_auto]" method="get">
        <label>
          <span className="sr-only">Buscar por nome</span>
          <input
            className={inputClassName}
            defaultValue={search}
            maxLength={120}
            name="busca"
            placeholder="Buscar por nome"
            type="search"
          />
        </label>
        <label>
          <span className="sr-only">Filtrar por equipe</span>
          <select
            className={inputClassName}
            defaultValue={teamFilter}
            name="equipe"
          >
            <option value="">Todas as equipes</option>
            <option value="sem-equipe">Sem equipe</option>
            {result.data.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Filtrar por status</span>
          <select
            className={inputClassName}
            defaultValue={statusFilter}
            name="status"
          >
            <option value="">Todos os status</option>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button className={secondaryButtonClassName} type="submit">
            Filtrar
          </button>
          {filtersAreActive ? (
            <Link
              aria-label="Limpar filtros"
              className="inline-flex min-h-11 items-center justify-center px-2 text-sm font-semibold text-muted-foreground transition hover:text-brand-primary"
              href="/corretores"
            >
              Limpar
            </Link>
          ) : null}
        </div>
      </form>

      <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-background">
        {filteredBrokers.length === 0 && !result.error ? (
          <EmptyState
            description={
              filtersAreActive
                ? "Ajuste a busca ou os filtros para ver outros resultados."
                : "Cadastre o primeiro corretor para iniciar a gestão das equipes."
            }
            title={
              filtersAreActive
                ? "Nenhum corretor encontrado"
                : "Nenhum corretor cadastrado"
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead className="bg-surface text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Nome</th>
                    <th className="px-5 py-4 font-semibold">Equipe atual</th>
                    <th className="px-5 py-4 font-semibold">ID KSI</th>
                    <th className="px-5 py-4 font-semibold">Presença</th>
                    <th className="px-5 py-4 font-semibold">Status</th>
                    <th className="px-5 py-4 text-right font-semibold">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredBrokers.map((broker) => (
                    <tr
                      className="transition hover:bg-surface/70"
                      key={broker.id}
                    >
                      <td className="px-5 py-4 text-sm font-semibold text-brand-secondary">
                        {broker.name}
                      </td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">
                        {broker.currentTeamName ?? "Sem equipe"}
                      </td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">
                        {broker.ksiId ?? "—"}
                      </td>
                      <td className="px-5 py-4">
                        <AttendanceSummary broker={broker} />
                      </td>
                      <td className="px-5 py-4">
                        {context.permissions.canToggleStatus ? (
                          <BrokerStatusToggle
                            active={broker.active}
                            brokerId={broker.id}
                            brokerName={broker.name}
                          />
                        ) : (
                          <StatusBadge active={broker.active} />
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {context.permissions.canEdit ? (
                          <Link
                            className="text-sm font-semibold text-brand-primary transition hover:text-brand-primary-hover"
                            href={`/corretores?editar=${encodeURIComponent(broker.id)}`}
                          >
                            Editar
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Somente leitura
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border md:hidden">
              {filteredBrokers.map((broker) => (
                <article className="p-4" key={broker.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-brand-secondary">
                        {broker.name}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        ID KSI: {broker.ksiId ?? "Não informado"}
                      </p>
                    </div>
                    {context.permissions.canToggleStatus ? (
                      <BrokerStatusToggle
                        active={broker.active}
                        brokerId={broker.id}
                        brokerName={broker.name}
                      />
                    ) : (
                      <StatusBadge active={broker.active} />
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                    <p className="text-sm text-muted-foreground">
                      Equipe:{" "}
                      <span className="font-semibold text-brand-secondary">
                        {broker.currentTeamName ?? "Sem equipe"}
                      </span>
                    </p>
                    {context.permissions.canEdit ? (
                      <Link
                        className="text-sm font-semibold text-brand-primary"
                        href={`/corretores?editar=${encodeURIComponent(broker.id)}`}
                      >
                        Editar
                      </Link>
                    ) : null}
                  </div>
                  <div className="mt-3 rounded-xl bg-surface px-3 py-3">
                    <AttendanceSummary broker={broker} />
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {showNewForm || showEditForm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-secondary/25 p-0 backdrop-blur-[1px] sm:items-center sm:p-6">
          <section
            aria-labelledby="broker-form-title"
            aria-modal="true"
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-background p-5 shadow-[0_24px_70px_rgba(37,41,54,0.18)] sm:max-w-lg sm:rounded-3xl sm:p-6"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-primary">
                  {showEditForm ? "Edição" : "Cadastro"}
                </p>
                <h2
                  className="mt-2 text-xl font-semibold text-brand-secondary"
                  id="broker-form-title"
                >
                  {showEditForm ? "Editar corretor" : "Novo corretor"}
                </h2>
              </div>
              <Link
                aria-label="Fechar formulário"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-lg text-muted-foreground transition hover:bg-surface hover:text-brand-secondary"
                href="/corretores"
              >
                ×
              </Link>
            </div>

            {errorCode && errorMessages[errorCode] ? (
              <FlashMessage message={errorMessages[errorCode]} type="error" />
            ) : null}

            <BrokerForm
              broker={showEditForm ? brokerToEdit : undefined}
              canToggleStatus={context.permissions.canToggleStatus}
              teams={result.data.teams}
            />
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
