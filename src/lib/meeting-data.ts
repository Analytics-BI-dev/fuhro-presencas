import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadAgencyParticipation } from "@/lib/attendance-data";
import {
  summarizeAttendance,
  type ExpectedAttendance,
} from "@/lib/attendance-rules";

type DatabaseRecord = Record<string, unknown>;

export type MeetingListItem = {
  absentCount: number;
  date: string;
  id: string;
  observation: string | null;
  percentage: number;
  presentCount: number;
  title: string | null;
  totalBrokers: number;
};

export type AttendanceBroker = {
  attendance: boolean | null;
  id: string;
  name: string;
  teamId: string | null;
  teamName: string | null;
};

export type MeetingDetail = {
  absentCount: number;
  brokers: AttendanceBroker[];
  date: string;
  id: string;
  observation: string | null;
  percentage: number;
  presentCount: number;
  reviewedCount: number;
  title: string | null;
  totalBrokers: number;
  unreviewedCount: number;
};

export type HistoricalTeamResult = {
  brokerTeamIds: Map<string, string>;
  teamNames: Map<string, string>;
};

function readText(record: DatabaseRecord, key: string) {
  const value = record[key];

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function logDataError(stage: string, error: { code?: string; message?: string }) {
  const code = error.code?.trim() || "UNKNOWN";
  const message =
    error.message?.replace(/\s+/g, " ").trim().slice(0, 500) ||
    "Erro sem mensagem";

  console.error(`[MEETINGS] ${stage}: code=${code} message=${message}`);
}

function failDataQuery(
  stage: string,
  error: { code?: string; message?: string },
): never {
  logDataError(stage, error);
  throw new Error("Não foi possível carregar os dados de reuniões.");
}

function calculatePercentage(present: number, total: number) {
  return total > 0 ? Math.round((present / total) * 100) : 0;
}

export function formatMeetingDate(date: string) {
  const parsedDate = new Date(`${date}T00:00:00.000Z`);

  if (Number.isNaN(parsedDate.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
    year: "numeric",
  }).format(parsedDate);
}

export async function resolveHistoricalTeams(
  supabase: SupabaseClient,
  agencyId: string,
  meetingDate: string,
  brokerIds: string[],
): Promise<HistoricalTeamResult> {
  const { data: teamData, error: teamError } = await supabase
    .from("equipes")
    .select("id,nome")
    .eq("imobiliaria_id", agencyId);

  if (teamError) {
    failDataQuery("Falha ao buscar equipes", teamError);
  }

  const teamNames = new Map<string, string>();

  for (const team of (teamData ?? []) as DatabaseRecord[]) {
    const teamId = readText(team, "id");

    if (teamId) {
      teamNames.set(teamId, readText(team, "nome") ?? "Equipe sem nome");
    }
  }

  const brokerTeamIds = new Map<string, string>();

  if (brokerIds.length === 0) {
    return { brokerTeamIds, teamNames };
  }

  const { data: linkData, error: linkError } = await supabase
    .from("corretor_equipes")
    .select("id,corretor_id,equipe_id,data_inicio,data_fim")
    .in("corretor_id", brokerIds)
    .lte("data_inicio", meetingDate)
    .order("data_inicio", { ascending: false });

  if (linkError) {
    failDataQuery("Falha ao buscar histórico de equipes", linkError);
  }

  for (const link of (linkData ?? []) as DatabaseRecord[]) {
    const brokerId = readText(link, "corretor_id");
    const teamId = readText(link, "equipe_id");
    const endDate = readText(link, "data_fim");
    const isValidOnMeetingDate = !endDate || endDate >= meetingDate;

    if (
      brokerId &&
      teamId &&
      isValidOnMeetingDate &&
      teamNames.has(teamId) &&
      !brokerTeamIds.has(brokerId)
    ) {
      brokerTeamIds.set(brokerId, teamId);
    }
  }

  return { brokerTeamIds, teamNames };
}

export async function loadMeetings(
  supabase: SupabaseClient,
  agencyId: string,
) {
  const participation = await loadAgencyParticipation(supabase, agencyId);
  const factsByMeeting = new Map<string, ExpectedAttendance[]>();

  for (const fact of participation.facts) {
    const meetingFacts = factsByMeeting.get(fact.meetingId) ?? [];
    meetingFacts.push(fact);
    factsByMeeting.set(fact.meetingId, meetingFacts);
  }

  return participation.meetings.map((meeting): MeetingListItem => {
    const summary = summarizeAttendance(
      factsByMeeting.get(meeting.id) ?? [],
    );

    return {
      absentCount: summary.absent,
      date: meeting.date,
      id: meeting.id,
      observation: meeting.observation,
      percentage: summary.percentage ?? 0,
      presentCount: summary.present,
      title: meeting.title,
      totalBrokers: summary.total,
    };
  });
}

export async function loadMeetingDetail(
  supabase: SupabaseClient,
  agencyId: string,
  meetingId: string,
): Promise<MeetingDetail | null> {
  const participation = await loadAgencyParticipation(supabase, agencyId);
  const meeting = participation.meetings.find(
    (item) => item.id === meetingId,
  );

  if (!meeting) {
    return null;
  }

  const meetingFacts = participation.facts.filter(
    (fact) => fact.meetingId === meeting.id,
  );
  const hasSavedAttendance = meetingFacts.some((fact) => fact.explicit);
  const brokerById = new Map(
    participation.brokers.map((broker) => [broker.id, broker] as const),
  );
  const teamNames = new Map(
    participation.teams.map((team) => [team.id, team.name] as const),
  );
  const brokers = meetingFacts
    .flatMap((fact): AttendanceBroker[] => {
      const broker = brokerById.get(fact.brokerId);

      if (!broker) {
        return [];
      }

      return [
        {
          attendance: hasSavedAttendance ? fact.attended : true,
          id: broker.id,
          name: broker.name,
          teamId: fact.teamId,
          teamName: teamNames.get(fact.teamId) ?? null,
        },
      ];
    })
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  const presentCount = brokers.filter(
    (broker) => broker.attendance === true,
  ).length;
  const absentCount = brokers.filter(
    (broker) => broker.attendance === false,
  ).length;
  const reviewedCount = presentCount + absentCount;

  return {
    absentCount,
    brokers,
    date: meeting.date,
    id: meeting.id,
    observation: meeting.observation,
    percentage: calculatePercentage(presentCount, brokers.length),
    presentCount,
    reviewedCount,
    title: meeting.title,
    totalBrokers: brokers.length,
    unreviewedCount: brokers.length - reviewedCount,
  };
}
