import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadAgencyParticipation } from "@/lib/attendance-data";
import { summarizeGlobalBrokerAttendance } from "@/lib/attendance-rules";

type DatabaseRecord = Record<string, unknown>;

export type TeamListItem = {
  active: boolean;
  currentBrokerCount: number;
  id: string;
  ksiId: string | null;
  name: string;
};

export type BrokerListItem = {
  active: boolean;
  absentCount: number;
  attendanceCount: number;
  attendancePercentage: number | null;
  currentLinkId: string | null;
  currentTeamId: string | null;
  currentTeamName: string | null;
  id: string;
  ksiId: string | null;
  name: string;
  presentCount: number;
};

export type DirectoryResult<T> = {
  data: T;
  error: string | null;
};

function readText(record: DatabaseRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function readId(record: DatabaseRecord, key = "id") {
  return readText(record, key);
}

function readActive(record: DatabaseRecord) {
  return record.ativo !== false;
}

export async function loadTeams(
  supabase: SupabaseClient,
  agencyId: string,
): Promise<DirectoryResult<TeamListItem[]>> {
  const { data: teamData, error: teamError } = await supabase
    .from("equipes")
    .select("*")
    .eq("imobiliaria_id", agencyId)
    .order("nome", { ascending: true });

  if (teamError) {
    return {
      data: [],
      error: "Não foi possível carregar as equipes. Tente novamente.",
    };
  }

  const teamRecords = (teamData ?? []) as DatabaseRecord[];
  const teamIds = teamRecords
    .map((team) => readId(team))
    .filter((id): id is string => Boolean(id));
  const currentCount = new Map<string, number>();

  if (teamIds.length > 0) {
    const { data: linkData, error: linkError } = await supabase
      .from("corretor_equipes")
      .select("equipe_id")
      .in("equipe_id", teamIds)
      .is("data_fim", null);

    if (linkError) {
      return {
        data: [],
        error: "Não foi possível carregar os vínculos das equipes.",
      };
    }

    for (const link of (linkData ?? []) as DatabaseRecord[]) {
      const teamId = readId(link, "equipe_id");

      if (teamId) {
        currentCount.set(teamId, (currentCount.get(teamId) ?? 0) + 1);
      }
    }
  }

  return {
    data: teamRecords.flatMap((team) => {
      const id = readId(team);

      if (!id) {
        return [];
      }

      return [
        {
          active: readActive(team),
          currentBrokerCount: currentCount.get(id) ?? 0,
          id,
          ksiId: readText(team, "id_ksi", "ksi_id"),
          name: readText(team, "nome") ?? "Equipe sem nome",
        },
      ];
    }),
    error: null,
  };
}

export async function loadBrokers(
  supabase: SupabaseClient,
  agencyId: string,
): Promise<
  DirectoryResult<{ brokers: BrokerListItem[]; teams: TeamListItem[] }>
> {
  try {
    const participation = await loadAgencyParticipation(supabase, agencyId, {
      deriveExpectedFacts: false,
    });
    const currentLinks = new Map<
      string,
      { id: string | null; startDate: string; teamId: string }
    >();

    for (const link of participation.links) {
      if (link.endDate) {
        continue;
      }

      const current = currentLinks.get(link.brokerId);

      if (!current || link.startDate > current.startDate) {
        currentLinks.set(link.brokerId, {
          id: link.id,
          startDate: link.startDate,
          teamId: link.teamId,
        });
      }
    }

    const currentBrokerCount = new Map<string, number>();

    for (const link of currentLinks.values()) {
      currentBrokerCount.set(
        link.teamId,
        (currentBrokerCount.get(link.teamId) ?? 0) + 1,
      );
    }

    const teams = participation.teams.map(
      (team): TeamListItem => ({
        active: team.active,
        currentBrokerCount: currentBrokerCount.get(team.id) ?? 0,
        id: team.id,
        ksiId: team.ksiId,
        name: team.name,
      }),
    );
    const teamNames = new Map(
      teams.map((team) => [team.id, team.name] as const),
    );
    const attendanceByBroker = summarizeGlobalBrokerAttendance(
      participation.brokers.map((broker) => broker.id),
      participation.meetings,
      participation.presences,
    );
    const brokers = participation.brokers.map((broker): BrokerListItem => {
      const currentLink = currentLinks.get(broker.id) ?? null;
      const attendance = attendanceByBroker.get(broker.id);

      return {
        active: broker.active,
        absentCount: attendance?.absent ?? 0,
        attendanceCount: attendance?.total ?? 0,
        attendancePercentage: attendance?.percentage ?? null,
        currentLinkId: currentLink?.id ?? null,
        currentTeamId: currentLink?.teamId ?? null,
        currentTeamName: currentLink
          ? (teamNames.get(currentLink.teamId) ?? "Equipe indisponível")
          : null,
        id: broker.id,
        ksiId: broker.ksiId,
        name: broker.name,
        presentCount: attendance?.present ?? 0,
      };
    });

    return { data: { brokers, teams }, error: null };
  } catch {
    return {
      data: { brokers: [], teams: [] },
      error: "Não foi possível carregar os corretores. Tente novamente.",
    };
  }
}
