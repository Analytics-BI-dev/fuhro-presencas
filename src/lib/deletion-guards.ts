import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type DatabaseRecord = Record<string, unknown>;

export type BrokerLinkSnapshot = {
  corretor_id: string;
  data_fim: string | null;
  data_inicio: string;
  equipe_id: string;
  id: string;
};

type GuardError = {
  code?: string;
};

type BrokerDeletionCheck =
  | { error: GuardError; ok: false }
  | {
      hasHistory: boolean;
      links: BrokerLinkSnapshot[];
      ok: true;
    };

type TeamDeletionCheck =
  | { error: GuardError; ok: false }
  | { hasHistory: boolean; ok: true };

function readText(record: DatabaseRecord, key: string) {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function checkBrokerDeletion(
  supabase: SupabaseClient,
  brokerId: string,
): Promise<BrokerDeletionCheck> {
  const [presenceResult, linkResult] = await Promise.all([
    supabase
      .from("presencas")
      .select("corretor_id", { count: "exact", head: true })
      .eq("corretor_id", brokerId),
    supabase
      .from("corretor_equipes")
      .select("id,corretor_id,equipe_id,data_inicio,data_fim")
      .eq("corretor_id", brokerId),
  ]);

  if (presenceResult.error || linkResult.error) {
    return {
      error: presenceResult.error ?? linkResult.error ?? { code: "UNKNOWN" },
      ok: false,
    };
  }

  const linkRecords = (linkResult.data ?? []) as DatabaseRecord[];
  const links = linkRecords.flatMap((link): BrokerLinkSnapshot[] => {
    const id = readText(link, "id");
    const linkedBrokerId = readText(link, "corretor_id");
    const teamId = readText(link, "equipe_id");
    const startDate = readText(link, "data_inicio");

    return id && linkedBrokerId && teamId && startDate
      ? [
          {
            corretor_id: linkedBrokerId,
            data_fim: readText(link, "data_fim"),
            data_inicio: startDate,
            equipe_id: teamId,
            id,
          },
        ]
      : [];
  });

  if (links.length !== linkRecords.length) {
    return { error: { code: "INVALID_LINK_DATA" }, ok: false };
  }

  return {
    hasHistory:
      (presenceResult.count ?? 0) > 0 ||
      links.some((link) => Boolean(link.data_fim)),
    links,
    ok: true,
  };
}

export async function checkTeamDeletion(
  supabase: SupabaseClient,
  teamId: string,
): Promise<TeamDeletionCheck> {
  const [presenceResult, linkResult] = await Promise.all([
    supabase
      .from("presencas")
      .select("equipe_id", { count: "exact", head: true })
      .eq("equipe_id", teamId),
    supabase
      .from("corretor_equipes")
      .select("equipe_id", { count: "exact", head: true })
      .eq("equipe_id", teamId),
  ]);

  if (presenceResult.error || linkResult.error) {
    return {
      error: presenceResult.error ?? linkResult.error ?? { code: "UNKNOWN" },
      ok: false,
    };
  }

  return {
    hasHistory:
      (presenceResult.count ?? 0) > 0 || (linkResult.count ?? 0) > 0,
    ok: true,
  };
}
