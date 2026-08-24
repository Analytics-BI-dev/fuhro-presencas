import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadAgencyParticipation } from "@/lib/attendance-data";

export type AttendanceHistoryItem = {
  attended: boolean;
  brokerId: string;
  brokerKsiId: string | null;
  brokerName: string;
  id: string;
  meetingDate: string;
  meetingId: string;
  meetingTitle: string | null;
  teamId: string | null;
  teamName: string | null;
};

export type AttendanceHistoryResult = {
  data: AttendanceHistoryItem[];
  error: string | null;
};

export async function loadAttendanceHistory(
  supabase: SupabaseClient,
  agencyId: string,
): Promise<AttendanceHistoryResult> {
  try {
    const participation = await loadAgencyParticipation(supabase, agencyId);
    const meetingById = new Map(
      participation.meetings.map((meeting) => [meeting.id, meeting] as const),
    );
    const brokerById = new Map(
      participation.brokers.map((broker) => [broker.id, broker] as const),
    );
    const teamById = new Map(
      participation.teams.map((team) => [team.id, team] as const),
    );
    const data = participation.facts.flatMap(
      (fact): AttendanceHistoryItem[] => {
        const meeting = meetingById.get(fact.meetingId);
        const broker = brokerById.get(fact.brokerId);

        if (!meeting || !broker) {
          return [];
        }

        const team = teamById.get(fact.teamId);

        return [
          {
            attended: fact.attended,
            brokerId: broker.id,
            brokerKsiId: broker.ksiId,
            brokerName: broker.name,
            id: `${meeting.id}:${broker.id}`,
            meetingDate: meeting.date,
            meetingId: meeting.id,
            meetingTitle: meeting.title,
            teamId: team?.id ?? null,
            teamName: team?.name ?? null,
          },
        ];
      },
    );

    data.sort(
      (left, right) =>
        right.meetingDate.localeCompare(left.meetingDate) ||
        left.brokerName.localeCompare(right.brokerName, "pt-BR"),
    );

    return { data, error: null };
  } catch {
    return {
      data: [],
      error: "Não foi possível carregar o histórico de presença.",
    };
  }
}
