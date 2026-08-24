import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

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
  currentLinkId: string | null;
  currentTeamId: string | null;
  currentTeamName: string | null;
  id: string;
  ksiId: string | null;
  name: string;
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
  const [teamResult, brokerResult] = await Promise.all([
    loadTeams(supabase, agencyId),
    supabase
      .from("corretores")
      .select("*")
      .eq("imobiliaria_id", agencyId)
      .order("nome", { ascending: true }),
  ]);

  if (teamResult.error) {
    return {
      data: { brokers: [], teams: [] },
      error: teamResult.error,
    };
  }

  if (brokerResult.error) {
    return {
      data: { brokers: [], teams: teamResult.data },
      error: "Não foi possível carregar os corretores. Tente novamente.",
    };
  }

  const brokerRecords = (brokerResult.data ?? []) as DatabaseRecord[];
  const brokerIds = brokerRecords
    .map((broker) => readId(broker))
    .filter((id): id is string => Boolean(id));
  const currentLinks = new Map<
    string,
    { id: string | null; teamId: string }
  >();

  if (brokerIds.length > 0) {
    const { data: linkData, error: linkError } = await supabase
      .from("corretor_equipes")
      .select("*")
      .in("corretor_id", brokerIds)
      .is("data_fim", null);

    if (linkError) {
      return {
        data: { brokers: [], teams: teamResult.data },
        error: "Não foi possível carregar os vínculos atuais dos corretores.",
      };
    }

    for (const link of (linkData ?? []) as DatabaseRecord[]) {
      const brokerId = readId(link, "corretor_id");
      const teamId = readId(link, "equipe_id");

      if (brokerId && teamId && !currentLinks.has(brokerId)) {
        currentLinks.set(brokerId, { id: readId(link), teamId });
      }
    }
  }

  const teamNames = new Map(
    teamResult.data.map((team) => [team.id, team.name] as const),
  );

  return {
    data: {
      brokers: brokerRecords.flatMap((broker) => {
        const id = readId(broker);

        if (!id) {
          return [];
        }

        const currentLink = currentLinks.get(id) ?? null;

        return [
          {
            active: readActive(broker),
            currentLinkId: currentLink?.id ?? null,
            currentTeamId: currentLink?.teamId ?? null,
            currentTeamName: currentLink
              ? (teamNames.get(currentLink.teamId) ?? "Equipe indisponível")
              : null,
            id,
            ksiId: readText(broker, "id_ksi", "ksi_id"),
            name:
              readText(broker, "nome", "nome_completo") ??
              "Corretor sem nome",
          },
        ];
      }),
      teams: teamResult.data,
    },
    error: null,
  };
}
