import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
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
import { loadTeams, type TeamListItem } from "@/lib/directory-data";

import { createTeam, updateTeam } from "./actions";

export const metadata: Metadata = {
  title: "Equipes | Fuhro Presenças",
};

type PageSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

const errorMessages: Record<string, string> = {
  "equipe-invalida": "A equipe informada não está disponível para edição.",
  "nao-foi-possivel-salvar":
    "Não foi possível salvar a equipe. Revise os dados e tente novamente.",
  "nome-obrigatorio": "Informe um nome válido para a equipe.",
  "sem-permissao": "Seu perfil não possui permissão para esta operação.",
};

const successMessages: Record<string, string> = {
  "equipe-atualizada": "Equipe atualizada com sucesso.",
  "equipe-criada": "Equipe cadastrada com sucesso.",
};

function readParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];

  return typeof value === "string" ? value : null;
}

function TeamForm({
  canToggleStatus,
  team,
}: {
  canToggleStatus: boolean;
  team?: TeamListItem;
}) {
  const isEditing = Boolean(team);

  return (
    <form action={isEditing ? updateTeam : createTeam} className="mt-6 space-y-5">
      {team ? <input name="equipe_id" type="hidden" value={team.id} /> : null}

      <Field label="Nome">
        <input
          autoComplete="off"
          autoFocus
          className={inputClassName}
          defaultValue={team?.name ?? ""}
          maxLength={160}
          name="nome"
          placeholder="Ex.: Equipe Conectados"
          required
        />
      </Field>

      <Field label="ID KSI (opcional)">
        <input
          autoComplete="off"
          className={inputClassName}
          defaultValue={team?.ksiId ?? ""}
          maxLength={100}
          name="id_ksi"
          placeholder="Identificador no KSI"
        />
      </Field>

      {canToggleStatus ? (
        <label className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <input
            className="mt-0.5 h-4 w-4 accent-brand-primary"
            defaultChecked={team?.active ?? true}
            name="ativo"
            type="checkbox"
          />
          <span>
            <span className="block text-sm font-semibold text-brand-secondary">
              Equipe ativa
            </span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              Equipes inativas permanecem no histórico e podem ser reativadas.
            </span>
          </span>
        </label>
      ) : (
        <p className="rounded-xl bg-surface px-4 py-3 text-xs leading-5 text-muted-foreground">
          Como operador, você pode editar os dados da equipe, mas somente um
          administrador pode alterar o status.
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Link className={secondaryButtonClassName} href="/equipes">
          Cancelar
        </Link>
        <SubmitButton
          label={isEditing ? "Salvar alterações" : "Cadastrar equipe"}
        />
      </div>
    </form>
  );
}

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const [context, params] = await Promise.all([
    requireAuthorization(),
    searchParams,
  ]);
  const result = await loadTeams(context.supabase, context.agency.id);
  const action = readParam(params, "acao");
  const editId = readParam(params, "editar");
  const errorCode = readParam(params, "erro");
  const successCode = readParam(params, "sucesso");
  const warningCode = readParam(params, "aviso");
  const teamToEdit = editId
    ? result.data.find((team) => team.id === editId)
    : undefined;
  const showNewForm = action === "nova" && context.permissions.canCreate;
  const showEditForm = Boolean(teamToEdit && context.permissions.canEdit);

  return (
    <AppShell
      currentPath="/equipes"
      pageTitle="Equipes"
      profile={context.profile}
    >
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-primary">
            {context.agency.name}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-secondary sm:text-3xl">
            Equipes
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Cadastre as equipes e acompanhe seus vínculos atuais com os
            corretores.
          </p>
        </div>

        {context.permissions.canCreate ? (
          <Link className={primaryButtonClassName} href="/equipes?acao=nova">
            Nova equipe
          </Link>
        ) : null}
      </section>

      {successCode && successMessages[successCode] ? (
        <FlashMessage message={successMessages[successCode]} type="success" />
      ) : null}
      {warningCode === "google-sheets" ? (
        <FlashMessage
          message="Alteração salva, mas não foi possível sincronizar com o Google Sheets."
          type="warning"
        />
      ) : null}
      {errorCode && errorMessages[errorCode] && !showNewForm && !showEditForm ? (
        <FlashMessage message={errorMessages[errorCode]} type="error" />
      ) : null}
      {result.error ? <FlashMessage message={result.error} type="error" /> : null}

      <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-background">
        {result.data.length === 0 && !result.error ? (
          <EmptyState
            description="Cadastre a primeira equipe para começar a organizar os corretores."
            title="Nenhuma equipe cadastrada"
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead className="bg-surface text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Nome</th>
                    <th className="px-5 py-4 font-semibold">ID KSI</th>
                    <th className="px-5 py-4 font-semibold">Status</th>
                    <th className="px-5 py-4 text-center font-semibold">
                      Corretores
                    </th>
                    <th className="px-5 py-4 text-right font-semibold">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.data.map((team) => (
                    <tr className="transition hover:bg-surface/70" key={team.id}>
                      <td className="px-5 py-4 text-sm font-semibold text-brand-secondary">
                        {team.name}
                      </td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">
                        {team.ksiId ?? "—"}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge
                          active={team.active}
                          activeLabel="Ativa"
                          inactiveLabel="Inativa"
                        />
                      </td>
                      <td className="px-5 py-4 text-center text-sm font-semibold text-brand-secondary">
                        {team.currentBrokerCount}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {context.permissions.canEdit ? (
                          <Link
                            className="text-sm font-semibold text-brand-primary transition hover:text-brand-primary-hover"
                            href={`/equipes?editar=${encodeURIComponent(team.id)}`}
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
              {result.data.map((team) => (
                <article className="p-4" key={team.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-brand-secondary">
                        {team.name}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        ID KSI: {team.ksiId ?? "Não informado"}
                      </p>
                    </div>
                    <StatusBadge
                      active={team.active}
                      activeLabel="Ativa"
                      inactiveLabel="Inativa"
                    />
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                    <p className="text-sm text-muted-foreground">
                      <span className="font-semibold text-brand-secondary">
                        {team.currentBrokerCount}
                      </span>{" "}
                      corretores atuais
                    </p>
                    {context.permissions.canEdit ? (
                      <Link
                        className="text-sm font-semibold text-brand-primary"
                        href={`/equipes?editar=${encodeURIComponent(team.id)}`}
                      >
                        Editar
                      </Link>
                    ) : null}
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
            aria-labelledby="team-form-title"
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
                  id="team-form-title"
                >
                  {showEditForm ? "Editar equipe" : "Nova equipe"}
                </h2>
              </div>
              <Link
                aria-label="Fechar formulário"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-lg text-muted-foreground transition hover:bg-surface hover:text-brand-secondary"
                href="/equipes"
              >
                ×
              </Link>
            </div>

            {errorCode && errorMessages[errorCode] ? (
              <FlashMessage message={errorMessages[errorCode]} type="error" />
            ) : null}

            <TeamForm
              canToggleStatus={context.permissions.canToggleStatus}
              team={showEditForm ? teamToEdit : undefined}
            />
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
