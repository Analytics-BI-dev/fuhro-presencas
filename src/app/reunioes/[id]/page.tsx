import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { AttendancePanel } from "@/components/attendance-panel";
import { FlashMessage, secondaryButtonClassName } from "@/components/module-ui";
import { requireAuthorization } from "@/lib/access";
import { formatMeetingDate, loadMeetingDetail } from "@/lib/meeting-data";

export const metadata: Metadata = {
  title: "Lançamento de presença | Fuhro Presenças",
};

export default async function MeetingAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sucesso?: string | string[] }>;
}) {
  const [{ id }, query, context] = await Promise.all([
    params,
    searchParams,
    requireAuthorization(),
  ]);

  if (!id || id.length > 100) {
    notFound();
  }

  const meeting = await loadMeetingDetail(
    context.supabase,
    context.imobiliaria_id,
    id,
  );

  if (!meeting) {
    notFound();
  }

  const title =
    meeting.title ?? `Reunião de ${formatMeetingDate(meeting.date)}`;
  const successCode =
    typeof query.sucesso === "string" ? query.sucesso : undefined;
  return (
    <AppShell
      currentPath={`/reunioes/${id}`}
      pageTitle="Lançamento de presença"
      profile={context.profile}
    >
      <Link className={secondaryButtonClassName} href="/reunioes">
        ← Voltar para reuniões
      </Link>

      <section className="mt-6">
        <p className="text-sm font-semibold text-brand-primary">
          {formatMeetingDate(meeting.date)} · {context.agency.name}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-secondary sm:text-3xl">
          {title}
        </h2>
        {meeting.observation ? (
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            {meeting.observation}
          </p>
        ) : null}
      </section>

      {successCode === "reuniao-criada" ? (
        <FlashMessage
          message="Reunião criada. Agora registre as presenças."
          type="success"
        />
      ) : null}

      <AttendancePanel
        brokers={meeting.brokers}
        canEdit={context.permissions.canEdit}
        meetingId={meeting.id}
      />
    </AppShell>
  );
}
