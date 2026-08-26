import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createGoogleSheetsClient } from "@/lib/google-sheets/client";

type DatabaseRecord = Record<string, unknown>;

type SheetName = "Corretores" | "Equipes" | "Registro";

type SheetPayload = {
  name: SheetName;
  values: Array<Array<boolean | string>>;
};

export type GoogleSheetsSyncResult = {
  ok: boolean;
};

const PAGE_SIZE = 1_000;

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

function sheetRange(name: SheetName, start: string, end: string) {
  return `'${name.replaceAll("'", "''")}'!${start}:${end}`;
}

function columnName(columnCount: number) {
  let value = columnCount;
  let result = "";

  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }

  return result;
}

function readErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return "UNKNOWN";
  }

  const candidate = error as {
    code?: unknown;
    response?: { status?: unknown };
  };
  const value = candidate.response?.status ?? candidate.code;

  return typeof value === "string" || typeof value === "number"
    ? String(value).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "UNKNOWN"
    : "UNKNOWN";
}

function logSyncError(stage: string, error: unknown) {
  console.error(
    `[GOOGLE_SHEETS] ${stage}: code=${readErrorCode(error)} message=Falha sanitizada na sincronização.`,
  );
}

async function readAllPages(
  stage: string,
  loadPage: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: unknown[] | null;
    error: { code?: string; message?: string } | null;
  }>,
) {
  const records: DatabaseRecord[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await loadPage(from, from + PAGE_SIZE - 1);

    if (result.error) {
      throw Object.assign(new Error("SUPABASE_QUERY_ERROR"), {
        code: `${stage}_${result.error.code ?? "UNKNOWN"}`,
      });
    }

    const page = (result.data ?? []) as DatabaseRecord[];
    records.push(...page);

    if (page.length < PAGE_SIZE) {
      return records;
    }
  }
}

async function writeSheets(payloads: SheetPayload[]) {
  const { client, spreadsheetId } = createGoogleSheetsClient();

  await client.spreadsheets.values.batchClear({
    requestBody: {
      ranges: payloads.map((payload) => {
        const columns = columnName(payload.values[0]?.length ?? 1);
        return sheetRange(payload.name, "A2", columns);
      }),
    },
    spreadsheetId,
  });

  await client.spreadsheets.values.batchUpdate({
    requestBody: {
      data: payloads.map((payload) => {
        const columns = columnName(payload.values[0]?.length ?? 1);
        const lastRow = Math.max(payload.values.length, 1);

        return {
          majorDimension: "ROWS",
          range: sheetRange(payload.name, "A1", `${columns}${lastRow}`),
          values: payload.values,
        };
      }),
      valueInputOption: "RAW",
    },
    spreadsheetId,
  });
}

async function buildCorretoresPayload(
  supabase: SupabaseClient,
  agencyId: string,
): Promise<SheetPayload> {
  const brokers = await readAllPages("CORRETORES", (from, to) =>
    supabase
      .from("corretores")
      .select("nome,id_ksi")
      .eq("imobiliaria_id", agencyId)
      .eq("ativo", true)
      .order("nome", { ascending: true })
      .range(from, to),
  );
  const rows = brokers
    .flatMap((broker): string[][] => {
      const name = readText(broker, "nome");
      const ksiId = readText(broker, "id_ksi");

      return name && ksiId ? [[name, ksiId]] : [];
    })
    .sort((left, right) => left[0].localeCompare(right[0], "pt-BR"));

  return {
    name: "Corretores",
    values: [["Nome e Sobrenome", "ID KSI"], ...rows],
  };
}

async function buildEquipesPayload(
  supabase: SupabaseClient,
  agencyId: string,
): Promise<SheetPayload> {
  const teams = await readAllPages("EQUIPES", (from, to) =>
    supabase
      .from("equipes")
      .select("nome,id_ksi")
      .eq("imobiliaria_id", agencyId)
      .eq("ativo", true)
      .order("nome", { ascending: true })
      .range(from, to),
  );
  const rows = teams
    .flatMap((team): string[][] => {
      const name = readText(team, "nome");

      return name ? [[name, readText(team, "id_ksi") ?? ""]] : [];
    })
    .sort((left, right) => left[0].localeCompare(right[0], "pt-BR"));

  return {
    name: "Equipes",
    values: [["Equipe", "ID KSI"], ...rows],
  };
}

async function buildRegistroPayload(
  supabase: SupabaseClient,
  agencyId: string,
): Promise<SheetPayload> {
  const [meetings, brokers, teams] = await Promise.all([
    readAllPages("REGISTRO_REUNIOES", (from, to) =>
      supabase
        .from("reunioes")
        .select("id,data_reuniao")
        .eq("imobiliaria_id", agencyId)
        .range(from, to),
    ),
    readAllPages("REGISTRO_CORRETORES", (from, to) =>
      supabase
        .from("corretores")
        .select("id,nome")
        .eq("imobiliaria_id", agencyId)
        .range(from, to),
    ),
    readAllPages("REGISTRO_EQUIPES", (from, to) =>
      supabase
        .from("equipes")
        .select("id,nome")
        .eq("imobiliaria_id", agencyId)
        .range(from, to),
    ),
  ]);
  const meetingIds = meetings
    .map((meeting) => readText(meeting, "id"))
    .filter((id): id is string => Boolean(id));
  const presences: DatabaseRecord[] = [];

  for (let index = 0; index < meetingIds.length; index += 100) {
    const meetingIdBatch = meetingIds.slice(index, index + 100);
    const batch = await readAllPages("REGISTRO_PRESENCAS", (from, to) =>
      supabase
        .from("presencas")
        .select("reuniao_id,corretor_id,equipe_id,compareceu")
        .in("reuniao_id", meetingIdBatch)
        .range(from, to),
    );
    presences.push(...batch);
  }

  const meetingById = new Map(
    meetings.flatMap((meeting) => {
      const id = readText(meeting, "id");
      const date = readText(meeting, "data_reuniao");

      return id && date ? ([[id, date]] as const) : [];
    }),
  );
  const brokerById = new Map(
    brokers.flatMap((broker) => {
      const id = readText(broker, "id");
      const name = readText(broker, "nome");

      return id && name ? ([[id, name]] as const) : [];
    }),
  );
  const teamById = new Map(
    teams.flatMap((team) => {
      const id = readText(team, "id");
      const name = readText(team, "nome");

      return id && name ? ([[id, name]] as const) : [];
    }),
  );
  const rows = presences
    .flatMap((presence): string[][] => {
      const meetingId = readText(presence, "reuniao_id");
      const brokerId = readText(presence, "corretor_id");
      const teamId = readText(presence, "equipe_id");
      const meetingDate = meetingId ? meetingById.get(meetingId) : null;
      const brokerName = brokerId ? brokerById.get(brokerId) : null;

      if (
        !meetingDate ||
        !brokerName ||
        typeof presence.compareceu !== "boolean"
      ) {
        return [];
      }

      return [
        [
          teamId ? (teamById.get(teamId) ?? "") : "",
          brokerName,
          meetingDate,
          presence.compareceu ? "Sim" : "Não",
        ],
      ];
    })
    .sort(
      (left, right) =>
        left[2].localeCompare(right[2]) ||
        left[1].localeCompare(right[1], "pt-BR"),
    );

  return {
    name: "Registro",
    values: [
      ["Equipes", "Corretor", "Data da Reunião", "Compareceu"],
      ...rows,
    ],
  };
}

async function runSync(
  stage: string,
  buildPayloads: () => Promise<SheetPayload[]>,
): Promise<GoogleSheetsSyncResult> {
  try {
    const payloads = await buildPayloads();
    await writeSheets(payloads);
    return { ok: true };
  } catch (error) {
    logSyncError(stage, error);
    return { ok: false };
  }
}

export async function syncCorretoresSheet(
  supabase: SupabaseClient,
  agencyId: string,
) {
  return runSync("Falha ao sincronizar Corretores", async () => [
    await buildCorretoresPayload(supabase, agencyId),
  ]);
}

export async function syncEquipesSheet(
  supabase: SupabaseClient,
  agencyId: string,
) {
  return runSync("Falha ao sincronizar Equipes", async () => [
    await buildEquipesPayload(supabase, agencyId),
  ]);
}

export async function syncRegistroSheet(
  supabase: SupabaseClient,
  agencyId: string,
) {
  return runSync("Falha ao sincronizar Registro", async () => [
    await buildRegistroPayload(supabase, agencyId),
  ]);
}

export async function syncAllGoogleSheets(
  supabase: SupabaseClient,
  agencyId: string,
) {
  return runSync("Falha na sincronização manual", async () =>
    Promise.all([
      buildCorretoresPayload(supabase, agencyId),
      buildEquipesPayload(supabase, agencyId),
      buildRegistroPayload(supabase, agencyId),
    ]),
  );
}
