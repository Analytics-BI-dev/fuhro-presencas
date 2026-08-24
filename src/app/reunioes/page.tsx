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
} from "@/components/module-ui";
import { SubmitButton } from "@/components/submit-button";
import { requireAuthorization } from "@/lib/access";
import {
  formatMeetingDate,
  loadMeetings,
  type MeetingListItem,
  type MeetingStatus,
} from "@/lib/meeting-data";

import { createMeeting, updateMeeting } from "./actions";

export const metadata: Metadata = {
  title: "Reuniões | Fuhro Presenças",
};

type PageSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

const errorMessages: Record<string, string> = {
  "campos-invalidos":
    "Revise o título e a observação e tente novamente.",
  "data-invalida": "Informe uma data válida para a reunião.",
  "nao-foi-possivel-salvar":
    "Não foi possível salvar a reunião. Tente novamente.",
  "reuniao-invalida":
    "A reunião informada não pertence à imobiliária atual.",
  "sem-permissao": "Seu perfil possui acesso somente para consulta.",
};

const successMessages: Record<string, string> = {
  "reuniao-atualizada": "Reunião atualizada com sucesso.",
};

function readParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];

  return typeof value === "string" ? value : null;
}

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function meetingTitle(meeting: MeetingListItem) {
  return meeting.title ?? `Reunião de ${formatMeetingDate(meeting.date)}`;
}

function StatusBadge({ status }: { status: MeetingStatus }) {
  const style =
    status === "Concluída"
      ? "bg-emerald-50 text-emerald-700"
      : status === "Em andamento"
        ? "bg-amber-50 text-amber-700"
        : "bg-surface-muted text-muted-foreground";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>
      {status}
    </span>
  );
}

function MeetingForm({ meeting }: { meeting?: MeetingListItem }) {
  const isEditing = Boolean(meeting);

  return (
    <form
      action={isEditing ? updateMeeting : createMeeting}
      className="mt-6 space-y-5"
    >
      {meeting ? (
        <input name="reuniao_id" type="hidden" value={meeting.id} />
      ) : null}

      <Field label="Data da reunião">
        <input
          autoFocus
          className={inputClassName}
          defaultValue={meeting?.date ?? todayInSaoPaulo()}
          name="data_reuniao"
          required
          type="date"
        />
      </Field>

      <Field label="Título (opcional)">
        <input
          className={inputClassName}
          defaultValue={meeting?.title ?? ""}
          maxLength={180}
          name="titulo"
          placeholder="Ex.: Reunião comercial semanal"
        />
      </Field>

      <Field label="Observação (opcional)">
        <textarea
          className={`${inputClassName} min-h-28 resize-y py-3`}
          defaultValue={meeting?.observation ?? ""}
          maxLength={2_000}
          name="observacao"
          placeholder="Informações adicionais sobre a reunião"
        />
      </Field>

      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Link className={secondaryButtonClassName} href="/reunioes">
          Cancelar
        </Link>
        <SubmitButton
          label={isEditing ? "Salvar alterações" : "Criar e lançar presença"}
        />
      </div>
    </form>
  );
}

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const [context, params] = await Promise.all([
    requireAuthorization(),
    searchParams,
  ]);
  const meetings = await loadMeetings(
    context.supabase,
    context.imobiliaria_id,
  );
  const action = readParam(params, "acao");
  const editId = readParam(params, "editar");
  const errorCode = readParam(params, "erro");
  const successCode = readParam(params, "sucesso");
  const meetingToEdit = editId
    ? meetings.find((meeting) => meeting.id === editId)
    : undefined;
  const showNewForm = action === "nova" && context.permissions.canCreate;
  const showEditForm = Boolean(meetingToEdit && context.permissions.canEdit);

  return (
    <AppShell
      currentPath="/reunioes"
      pageTitle="Reuniões"
      profile={context.profile}
    >
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-primary">
            {context.agency.name}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-secondary sm:text-3xl">
            Reuniões
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Crie reuniões e acompanhe o preenchimento das presenças da equipe.
          </p>
        </div>

        {context.permissions.canCreate ? (
          <Link className={primaryButtonClassName} href="/reunioes?acao=nova">
            Nova reunião
          </Link>
        ) : null}
      </section>

      {successCode && successMessages[successCode] ? (
        <FlashMessage message={successMessages[successCode]} type="success" />
      ) : null}
      {errorCode && errorMessages[errorCode] && !showNewForm && !showEditForm ? (
        <FlashMessage message={errorMessages[errorCode]} type="error" />
      ) : null}

      <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-background">
        {meetings.length === 0 ? (
          <EmptyState
            description="Crie a primeira reunião para iniciar o lançamento de presença."
            title="Nenhuma reunião cadastrada"
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full border-collapse text-left">
                <thead className="bg-surface text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-4 font-semibold">Data</th>
                    <th className="px-4 py-4 font-semibold">Título</th>
                    <th className="px-4 py-4 text-center font-semibold">
                      Corretores
                    </th>
                    <th className="px-4 py-4 text-center font-semibold">
                      Presentes
                    </th>
                    <th className="px-4 py-4 text-center font-semibold">
                      Ausentes
                    </th>
                    <th className="px-4 py-4 text-center font-semibold">
                      Presença
                    </th>
                    <th className="px-4 py-4 font-semibold">Status</th>
                    <th className="px-4 py-4 text-right font-semibold">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {meetings.map((meeting) => (
                    <tr
                      className="transition hover:bg-surface/70"
                      key={meeting.id}
                    >
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
                        {formatMeetingDate(meeting.date)}
                      </td>
                      <td className="max-w-64 px-4 py-4 text-sm font-semibold text-brand-secondary">
                        <span className="line-clamp-2">
                          {meetingTitle(meeting)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center text-sm font-semibold text-brand-secondary">
                        {meeting.totalBrokers}
                      </td>
                      <td className="px-4 py-4 text-center text-sm text-emerald-700">
                        {meeting.presentCount}
                      </td>
                      <td className="px-4 py-4 text-center text-sm text-muted-foreground">
                        {meeting.absentCount}
                      </td>
                      <td className="px-4 py-4 text-center text-sm font-semibold text-brand-secondary">
                        {meeting.percentage}%
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={meeting.status} />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-3">
                          {context.permissions.canEdit ? (
                            <Link
                              className="text-sm font-semibold text-muted-foreground transition hover:text-brand-primary"
                              href={`/reunioes?editar=${encodeURIComponent(meeting.id)}`}
                            >
                              Editar
                            </Link>
                          ) : null}
                          <Link
                            className="text-sm font-semibold text-brand-primary transition hover:text-brand-primary-hover"
                            href={`/reunioes/${encodeURIComponent(meeting.id)}`}
                          >
                            {context.permissions.canEdit ? "Lançar" : "Consultar"}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border lg:hidden">
              {meetings.map((meeting) => (
                <article className="p-4 sm:p-5" key={meeting.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-brand-primary">
                        {formatMeetingDate(meeting.date)}
                      </p>
                      <h3 className="mt-1 font-semibold text-brand-secondary">
                        {meetingTitle(meeting)}
                      </h3>
                    </div>
                    <StatusBadge status={meeting.status} />
                  </div>
                  <dl className="mt-4 grid grid-cols-4 gap-2 rounded-xl bg-surface p-3 text-center">
                    <div>
                      <dt className="text-[0.65rem] text-muted-foreground">
                        Total
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-brand-secondary">
                        {meeting.totalBrokers}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[0.65rem] text-muted-foreground">
                        Presentes
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-emerald-700">
                        {meeting.presentCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[0.65rem] text-muted-foreground">
                        Ausentes
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-brand-secondary">
                        {meeting.absentCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[0.65rem] text-muted-foreground">
                        Presença
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-brand-secondary">
                        {meeting.percentage}%
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex justify-end gap-4">
                    {context.permissions.canEdit ? (
                      <Link
                        className="text-sm font-semibold text-muted-foreground"
                        href={`/reunioes?editar=${encodeURIComponent(meeting.id)}`}
                      >
                        Editar
                      </Link>
                    ) : null}
                    <Link
                      className="text-sm font-semibold text-brand-primary"
                      href={`/reunioes/${encodeURIComponent(meeting.id)}`}
                    >
                      {context.permissions.canEdit ? "Lançar presença" : "Consultar"}
                    </Link>
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
            aria-labelledby="meeting-form-title"
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
                  id="meeting-form-title"
                >
                  {showEditForm ? "Editar reunião" : "Nova reunião"}
                </h2>
              </div>
              <Link
                aria-label="Fechar formulário"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-lg text-muted-foreground transition hover:bg-surface hover:text-brand-secondary"
                href="/reunioes"
              >
                ×
              </Link>
            </div>

            {errorCode && errorMessages[errorCode] ? (
              <FlashMessage message={errorMessages[errorCode]} type="error" />
            ) : null}

            <MeetingForm meeting={showEditForm ? meetingToEdit : undefined} />
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
