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
import { requireAdminAuthorization } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadManagedUsers,
  type ManagedUser,
} from "@/lib/user-management-data";

import {
  createManagedUser,
  resetUserPassword,
  updateUserStatus,
} from "./actions";

export const metadata: Metadata = {
  title: "Usuários | Fuhro Presenças",
};

type PageSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

const errorMessages: Record<string, string> = {
  "auto-inativacao": "Você não pode inativar seu próprio usuário.",
  "campos-invalidos": "Informe um nome e um e-mail válidos.",
  "email-duplicado": "Já existe um usuário cadastrado com este e-mail.",
  "falha-criacao": "Não foi possível criar o usuário. Tente novamente.",
  "falha-provisionamento":
    "O usuário foi criado no Auth, mas não foi possível concluir sua configuração. Procure o suporte.",
  "falha-senha": "Não foi possível redefinir a senha. Tente novamente.",
  "falha-status":
    "Não foi possível alterar o status do usuário. Tente novamente.",
  "senha-invalida": "A senha deve possuir pelo menos 8 caracteres.",
  "senhas-diferentes": "A senha e a confirmação devem ser iguais.",
  "usuario-invalido":
    "O usuário informado não pertence à imobiliária atual.",
};

const successMessages: Record<string, string> = {
  "senha-redefinida": "Senha redefinida com sucesso.",
  "usuario-criado": "Usuário criado com sucesso.",
  "usuario-inativado": "Usuário inativado com sucesso.",
  "usuario-reativado": "Usuário reativado com sucesso.",
};

function readParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];

  return typeof value === "string" ? value : "";
}

function formatCreationDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Não informada";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function roleLabel(role: string) {
  if (role === "admin") {
    return "Admin";
  }

  if (role === "operador") {
    return "Operador";
  }

  if (role === "visualizador") {
    return "Visualizador";
  }

  return "Não definido";
}

function UserActions({
  currentUserId,
  user,
}: {
  currentUserId: string;
  user: ManagedUser;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <Link
        className="text-sm font-semibold text-brand-primary transition hover:text-brand-primary-hover"
        href={`/usuarios?redefinir=${encodeURIComponent(user.id)}`}
      >
        Redefinir senha
      </Link>
      {user.id === currentUserId && user.active ? (
        <span className="text-xs font-semibold text-muted-foreground">
          Conta atual
        </span>
      ) : (
        <form action={updateUserStatus}>
          <input name="user_id" type="hidden" value={user.id} />
          <input name="ativo" type="hidden" value={String(!user.active)} />
          <button
            className={`text-sm font-semibold transition ${
              user.active
                ? "text-muted-foreground hover:text-brand-primary"
                : "text-brand-primary hover:text-brand-primary-hover"
            }`}
            type="submit"
          >
            {user.active ? "Inativar" : "Reativar"}
          </button>
        </form>
      )}
    </div>
  );
}

function CreateUserForm() {
  return (
    <form action={createManagedUser} className="mt-6 space-y-5">
      <Field label="Nome">
        <input
          autoComplete="name"
          autoFocus
          className={inputClassName}
          maxLength={180}
          name="nome"
          placeholder="Nome completo"
          required
        />
      </Field>

      <Field label="E-mail/login">
        <input
          autoComplete="email"
          className={inputClassName}
          maxLength={254}
          name="email"
          placeholder="usuario@empresa.com.br"
          required
          type="email"
        />
      </Field>

      <Field label="Senha">
        <input
          autoComplete="new-password"
          className={inputClassName}
          maxLength={4_096}
          minLength={8}
          name="senha"
          placeholder="Mínimo de 8 caracteres"
          required
          type="password"
        />
      </Field>

      <Field label="Confirmar senha">
        <input
          autoComplete="new-password"
          className={inputClassName}
          maxLength={4_096}
          minLength={8}
          name="confirmar_senha"
          placeholder="Repita a senha"
          required
          type="password"
        />
      </Field>

      <div className="rounded-xl border border-border bg-surface px-4 py-3">
        <p className="text-sm font-semibold text-brand-secondary">
          Perfil: Operador
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          O usuário será criado confirmado, vinculado automaticamente à
          imobiliária atual e poderá entrar imediatamente com o e-mail e a
          senha definidos.
        </p>
      </div>

      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Link className={secondaryButtonClassName} href="/usuarios">
          Cancelar
        </Link>
        <SubmitButton label="Criar usuário" pendingLabel="Criando..." />
      </div>
    </form>
  );
}

function ResetPasswordForm({ user }: { user: ManagedUser }) {
  return (
    <form action={resetUserPassword} className="mt-6 space-y-5">
      <input name="user_id" type="hidden" value={user.id} />
      <div className="rounded-xl border border-border bg-surface px-4 py-3">
        <p className="text-sm font-semibold text-brand-secondary">
          {user.name}
        </p>
        <p className="mt-1 break-all text-xs text-muted-foreground">
          {user.email}
        </p>
      </div>

      <Field label="Nova senha">
        <input
          autoComplete="new-password"
          autoFocus
          className={inputClassName}
          maxLength={4_096}
          minLength={8}
          name="senha"
          placeholder="Mínimo de 8 caracteres"
          required
          type="password"
        />
      </Field>

      <Field label="Confirmar nova senha">
        <input
          autoComplete="new-password"
          className={inputClassName}
          maxLength={4_096}
          minLength={8}
          name="confirmar_senha"
          placeholder="Repita a nova senha"
          required
          type="password"
        />
      </Field>

      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Link className={secondaryButtonClassName} href="/usuarios">
          Cancelar
        </Link>
        <SubmitButton label="Redefinir senha" pendingLabel="Salvando..." />
      </div>
    </form>
  );
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const [context, params] = await Promise.all([
    requireAdminAuthorization(),
    searchParams,
  ]);
  const adminClient = createAdminClient();
  const users = await loadManagedUsers(
    context.supabase,
    adminClient,
    context.imobiliaria_id,
    context.agency.name,
  );
  const search = readParam(params, "busca").trim().slice(0, 120);
  const statusFilter = readParam(params, "status");
  const action = readParam(params, "acao");
  const resetUserId = readParam(params, "redefinir");
  const errorCode = readParam(params, "erro");
  const successCode = readParam(params, "sucesso");
  const normalizedSearch = search.toLocaleLowerCase("pt-BR");
  const filteredUsers = users
    .filter((user) => {
      const matchesSearch = normalizedSearch
        ? user.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
          user.email.toLocaleLowerCase("pt-BR").includes(normalizedSearch)
        : true;
      const matchesStatus =
        statusFilter === "ativos"
          ? user.active
          : statusFilter === "inativos"
            ? !user.active
            : true;

      return matchesSearch && matchesStatus;
    })
    .sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
  const filtersAreActive = Boolean(search || statusFilter);
  const showCreateForm = action === "novo";
  const userToReset = resetUserId
    ? users.find((user) => user.id === resetUserId)
    : undefined;
  const showResetForm = Boolean(userToReset);

  return (
    <AppShell
      currentPath="/usuarios"
      pageTitle="Usuários"
      profile={context.profile}
    >
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-primary">
            {context.agency.name}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-secondary sm:text-3xl">
            Gestão de usuários
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Crie operadores e controle o acesso dos usuários vinculados à
            imobiliária.
          </p>
        </div>

        <Link className={primaryButtonClassName} href="/usuarios?acao=novo">
          Novo usuário
        </Link>
      </section>

      {successCode && successMessages[successCode] ? (
        <FlashMessage message={successMessages[successCode]} type="success" />
      ) : null}
      {errorCode &&
      errorMessages[errorCode] &&
      !showCreateForm &&
      !showResetForm ? (
        <FlashMessage message={errorMessages[errorCode]} type="error" />
      ) : null}

      <form className="mt-6 grid gap-3 rounded-2xl border border-border bg-background p-4 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,0.35fr)_auto]" method="get">
        <label>
          <span className="sr-only">Buscar por nome ou e-mail</span>
          <input
            className={inputClassName}
            defaultValue={search}
            maxLength={120}
            name="busca"
            placeholder="Buscar por nome ou e-mail"
            type="search"
          />
        </label>
        <label>
          <span className="sr-only">Filtrar por status</span>
          <select
            className={inputClassName}
            defaultValue={statusFilter}
            name="status"
          >
            <option value="">Todos</option>
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
              className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-muted-foreground transition hover:text-brand-primary"
              href="/usuarios"
            >
              Limpar
            </Link>
          ) : null}
        </div>
      </form>

      <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-background">
        {filteredUsers.length === 0 ? (
          <EmptyState
            description={
              filtersAreActive
                ? "Ajuste a busca ou o filtro para encontrar outros usuários."
                : "Crie o primeiro usuário operador da imobiliária."
            }
            title={
              filtersAreActive
                ? "Nenhum usuário encontrado"
                : "Nenhum usuário vinculado"
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full border-collapse text-left">
                <thead className="bg-surface text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-4 font-semibold">Nome</th>
                    <th className="px-4 py-4 font-semibold">E-mail</th>
                    <th className="px-4 py-4 font-semibold">Perfil</th>
                    <th className="px-4 py-4 font-semibold">Imobiliária</th>
                    <th className="px-4 py-4 font-semibold">Status</th>
                    <th className="px-4 py-4 font-semibold">Criação</th>
                    <th className="px-4 py-4 text-right font-semibold">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers.map((user) => (
                    <tr className="transition hover:bg-surface/70" key={user.id}>
                      <td className="px-4 py-4 text-sm font-semibold text-brand-secondary">
                        {user.name}
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {user.email}
                      </td>
                      <td className="px-4 py-4 text-sm text-brand-secondary">
                        {roleLabel(user.role)}
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {user.agencyName}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge active={user.active} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
                        {formatCreationDate(user.createdAt)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <UserActions
                          currentUserId={context.user.id}
                          user={user}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border lg:hidden">
              {filteredUsers.map((user) => (
                <article className="p-4 sm:p-5" key={user.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-brand-secondary">
                        {user.name}
                      </h3>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                    <StatusBadge active={user.active} />
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-surface p-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Perfil</dt>
                      <dd className="mt-1 font-semibold text-brand-secondary">
                        {roleLabel(user.role)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Imobiliária
                      </dt>
                      <dd className="mt-1 font-semibold text-brand-secondary">
                        {user.agencyName}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      Criado em {formatCreationDate(user.createdAt)}
                    </p>
                    <UserActions
                      currentUserId={context.user.id}
                      user={user}
                    />
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {showCreateForm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-secondary/25 p-0 backdrop-blur-[1px] sm:items-center sm:p-6">
          <section
            aria-labelledby="create-user-form-title"
            aria-modal="true"
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-background p-5 shadow-[0_24px_70px_rgba(37,41,54,0.18)] sm:max-w-lg sm:rounded-3xl sm:p-6"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-primary">
                  Cadastro
                </p>
                <h2
                  className="mt-2 text-xl font-semibold text-brand-secondary"
                  id="create-user-form-title"
                >
                  Novo usuário
                </h2>
              </div>
              <Link
                aria-label="Fechar formulário"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-lg text-muted-foreground transition hover:bg-surface hover:text-brand-secondary"
                href="/usuarios"
              >
                ×
              </Link>
            </div>

            {errorCode && errorMessages[errorCode] ? (
              <FlashMessage message={errorMessages[errorCode]} type="error" />
            ) : null}

            <CreateUserForm />
          </section>
        </div>
      ) : null}

      {showResetForm && userToReset ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-secondary/25 p-0 backdrop-blur-[1px] sm:items-center sm:p-6">
          <section
            aria-labelledby="reset-password-form-title"
            aria-modal="true"
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-background p-5 shadow-[0_24px_70px_rgba(37,41,54,0.18)] sm:max-w-lg sm:rounded-3xl sm:p-6"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-primary">
                  Segurança
                </p>
                <h2
                  className="mt-2 text-xl font-semibold text-brand-secondary"
                  id="reset-password-form-title"
                >
                  Redefinir senha
                </h2>
              </div>
              <Link
                aria-label="Fechar formulário"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-lg text-muted-foreground transition hover:bg-surface hover:text-brand-secondary"
                href="/usuarios"
              >
                ×
              </Link>
            </div>

            {errorCode && errorMessages[errorCode] ? (
              <FlashMessage message={errorMessages[errorCode]} type="error" />
            ) : null}

            <ResetPasswordForm user={userToReset} />
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
