import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

import { runDryRun } from "./import-presencas.mjs";

const EXPECTED = {
  absent: 186,
  currentBrokers: 30,
  historicalBrokers: 18,
  meetings: 19,
  present: 476,
  presences: 662,
  teamLinks: 48,
  teams: 4,
};
const EXPECTED_DATES = [
  "2026-04-10",
  "2026-04-13",
  "2026-04-20",
  "2026-04-27",
  "2026-05-05",
  "2026-05-11",
  "2026-05-18",
  "2026-05-25",
  "2026-06-03",
  "2026-06-10",
  "2026-06-15",
  "2026-06-22",
  "2026-07-08",
  "2026-07-15",
  "2026-07-20",
  "2026-07-27",
  "2026-08-10",
  "2026-08-17",
  "2026-08-24",
];
const EXPECTED_HISTORICAL_BROKERS = [
  "Alexandra Marques",
  "Andressa Borges",
  "Brenda Silva",
  "Camila Oliveira",
  "Dominick Barbosa",
  "Ericson Lunkes",
  "Gabriel Dalvit",
  "Glória Rodrigues",
  "Gustavo Oliveira",
  "Luis Felipe",
  "Magali Lessa",
  "Marilia Amaro",
  "Mickael Veleda",
  "Paola Pinheiro",
  "Roberto Barcelos",
  "Rovane Costa",
  "Tayla Rosa",
  "Yuri Bock",
].sort((left, right) => left.localeCompare(right, "pt-BR"));
const EXPECTED_TEAMS = ["Conectados", "Determinados", "Ferrari", "Fênix"];
const INSERT_BATCH_SIZE = 200;

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function cleanDatabaseError(stage, error) {
  const code = error?.code ? String(error.code).slice(0, 80) : "UNKNOWN";
  const message = error?.message
    ? String(error.message).replace(/\s+/gu, " ").trim().slice(0, 500)
    : "Erro sem mensagem";

  return new Error(`${stage}: code=${code} message=${message}`);
}

function validateExpectedAnalysis(analysis) {
  const historicalNames = analysis.historicalBrokers
    .map((broker) => broker.name)
    .sort((left, right) => left.localeCompare(right, "pt-BR"));
  const teamNames = analysis.teams
    .map((team) => team.name)
    .sort((left, right) => left.localeCompare(right, "pt-BR"));
  const expectedTeamNames = [...EXPECTED_TEAMS].sort((left, right) =>
    left.localeCompare(right, "pt-BR"),
  );
  const periodCounts = new Map();

  for (const period of analysis.teamHistory.periods) {
    periodCounts.set(
      period.brokerName,
      (periodCounts.get(period.brokerName) ?? 0) + 1,
    );
  }

  ensure(
    analysis.currentBrokers.length === EXPECTED.currentBrokers,
    `Pré-validação falhou: esperados ${EXPECTED.currentBrokers} corretores atuais, encontrados ${analysis.currentBrokers.length}.`,
  );
  ensure(
    analysis.historicalBrokers.length === EXPECTED.historicalBrokers,
    `Pré-validação falhou: esperados ${EXPECTED.historicalBrokers} corretores históricos, encontrados ${analysis.historicalBrokers.length}.`,
  );
  ensure(
    JSON.stringify(historicalNames) ===
      JSON.stringify(EXPECTED_HISTORICAL_BROKERS),
    "Pré-validação falhou: a lista de corretores históricos difere da lista aprovada.",
  );
  ensure(
    analysis.teams.length === EXPECTED.teams &&
      JSON.stringify(teamNames) === JSON.stringify(expectedTeamNames),
    "Pré-validação falhou: o catálogo de equipes difere do conjunto aprovado.",
  );
  ensure(
    analysis.teams.find((team) => team.name === "Fênix")?.ksiId === null,
    "Pré-validação falhou: Fênix deve permanecer sem ID KSI.",
  );
  ensure(
    analysis.validMeetingDates.length === EXPECTED.meetings &&
      JSON.stringify(analysis.validMeetingDates) ===
        JSON.stringify(EXPECTED_DATES),
    "Pré-validação falhou: as datas das reuniões diferem da lista aprovada.",
  );
  ensure(
    analysis.validPresenceRows.length === EXPECTED.presences,
    `Pré-validação falhou: esperadas ${EXPECTED.presences} presenças, encontradas ${analysis.validPresenceRows.length}.`,
  );
  ensure(
    analysis.presentCount === EXPECTED.present &&
      analysis.absentCount === EXPECTED.absent,
    "Pré-validação falhou: os totais de presentes e ausentes não conferem.",
  );
  ensure(
    analysis.invalidPresenceRows.length === 0 &&
      analysis.duplicatePresenceGroups.length === 0 &&
      analysis.unknownTeams.length === 0 &&
      analysis.possibleNames.length === 0,
    "Pré-validação falhou: o dry-run contém inconsistências impeditivas.",
  );
  ensure(
    analysis.teamHistory.ambiguities.length === 0 &&
      analysis.teamHistory.periods.length === EXPECTED.teamLinks &&
      [...periodCounts.values()].every((count) => count === 1),
    "Pré-validação falhou: foram detectadas mudanças ou ambiguidades de equipe.",
  );
  ensure(
    analysis.currentBrokers.every((broker) => broker.ksiId),
    "Pré-validação falhou: existe corretor atual sem ID KSI.",
  );
  ensure(
    analysis.currentBrokers.every((broker) => periodCounts.has(broker.name)),
    "Pré-validação falhou: existe corretor atual sem ocorrência no Registro.",
  );
}

async function findFuhroAgency(supabase) {
  const { data, error } = await supabase
    .from("imobiliarias")
    .select("id,nome")
    .eq("nome", "Fuhro")
    .limit(2);

  if (error) {
    throw cleanDatabaseError("Falha ao localizar a imobiliária Fuhro", error);
  }

  ensure(
    (data ?? []).length === 1,
    `A importação exige exatamente uma imobiliária chamada Fuhro; encontradas ${(data ?? []).length}.`,
  );

  return data[0];
}

async function countAllRows(supabase, table) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    throw cleanDatabaseError(`Falha ao validar a tabela ${table}`, error);
  }

  return count ?? 0;
}

async function assertBusinessTablesAreEmpty(supabase) {
  const tables = [
    "equipes",
    "corretores",
    "corretor_equipes",
    "reunioes",
    "presencas",
  ];
  const counts = await Promise.all(
    tables.map(async (table) => [table, await countAllRows(supabase, table)]),
  );
  const nonEmpty = counts.filter(([, count]) => count > 0);

  ensure(
    nonEmpty.length === 0,
    `Importação abortada: a base de negócio não está vazia (${nonEmpty.map(([table, count]) => `${table}=${count}`).join(", ")}).`,
  );
}

async function insertReturning(supabase, table, rows, selectColumns) {
  const { data, error } = await supabase
    .from(table)
    .insert(rows)
    .select(selectColumns);

  if (error) {
    throw cleanDatabaseError(`Falha ao inserir em ${table}`, error);
  }

  ensure(
    (data ?? []).length === rows.length,
    `Falha ao inserir em ${table}: retorno incompleto da API.`,
  );

  return data;
}

async function insertPresencesInBatches(supabase, rows) {
  let inserted = 0;

  for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
    const batch = rows.slice(start, start + INSERT_BATCH_SIZE);
    const { error } = await supabase.from("presencas").insert(batch);

    if (error) {
      throw cleanDatabaseError(
        `Falha ao inserir presenças no lote ${Math.floor(start / INSERT_BATCH_SIZE) + 1}`,
        error,
      );
    }

    inserted += batch.length;
  }

  return inserted;
}

async function deleteByIds(supabase, table, column, ids) {
  if (ids.length === 0) {
    return null;
  }

  const { error } = await supabase.from(table).delete().in(column, ids);
  return error ? cleanDatabaseError(`Rollback falhou em ${table}`, error) : null;
}

async function rollbackImport(supabase, created) {
  const errors = [];
  const steps = [
    ["presencas", "reuniao_id", created.meetingIds],
    ["corretor_equipes", "corretor_id", created.brokerIds],
    ["reunioes", "id", created.meetingIds],
    ["corretores", "id", created.brokerIds],
    ["equipes", "id", created.teamIds],
  ];

  for (const [table, column, ids] of steps) {
    const error = await deleteByIds(supabase, table, column, ids);

    if (error) {
      errors.push(error.message);
    }
  }

  return errors;
}

function mapBy(rows, key) {
  return new Map(rows.map((row) => [row[key], row]));
}

async function validateImportedData(supabase, created) {
  const [teamResult, brokerResult, linkResult, meetingResult, presenceResult] =
    await Promise.all([
      supabase
        .from("equipes")
        .select("id,nome,id_ksi,ativo,imobiliaria_id")
        .in("id", created.teamIds),
      supabase
        .from("corretores")
        .select("id,nome,id_ksi,ativo,imobiliaria_id")
        .in("id", created.brokerIds),
      supabase
        .from("corretor_equipes")
        .select("id,corretor_id,equipe_id,data_inicio,data_fim")
        .in("corretor_id", created.brokerIds),
      supabase
        .from("reunioes")
        .select("id,data_reuniao,imobiliaria_id,created_by")
        .in("id", created.meetingIds),
      supabase
        .from("presencas")
        .select("reuniao_id,corretor_id,equipe_id,compareceu,registrado_por")
        .in("reuniao_id", created.meetingIds),
    ]);
  const results = [
    ["equipes", teamResult],
    ["corretores", brokerResult],
    ["corretor_equipes", linkResult],
    ["reunioes", meetingResult],
    ["presencas", presenceResult],
  ];

  for (const [table, result] of results) {
    if (result.error) {
      throw cleanDatabaseError(
        `Falha na validação pós-importação de ${table}`,
        result.error,
      );
    }
  }

  const teams = teamResult.data ?? [];
  const brokers = brokerResult.data ?? [];
  const links = linkResult.data ?? [];
  const meetings = meetingResult.data ?? [];
  const presences = presenceResult.data ?? [];
  const teamIds = new Set(teams.map((team) => team.id));
  const brokerIds = new Set(brokers.map((broker) => broker.id));
  const meetingIds = new Set(meetings.map((meeting) => meeting.id));
  const currentBrokers = brokers.filter((broker) => broker.ativo === true);
  const historicalBrokers = brokers.filter((broker) => broker.ativo === false);
  const currentLinkCounts = new Map();
  const presenceKeys = new Set();

  for (const link of links) {
    if (link.data_fim === null) {
      currentLinkCounts.set(
        link.corretor_id,
        (currentLinkCounts.get(link.corretor_id) ?? 0) + 1,
      );
    }
  }

  for (const presence of presences) {
    const key = `${presence.reuniao_id}\u0000${presence.corretor_id}`;
    ensure(
      !presenceKeys.has(key),
      "Validação pós-importação falhou: presença duplicada por reunião e corretor.",
    );
    presenceKeys.add(key);
  }

  const present = presences.filter(
    (presence) => presence.compareceu === true,
  ).length;
  const absent = presences.filter(
    (presence) => presence.compareceu === false,
  ).length;

  ensure(teams.length === EXPECTED.teams, "Total de equipes divergente.");
  ensure(
    teams.every(
      (team) => team.ativo === true && team.imobiliaria_id === created.agencyId,
    ),
    "Validação de status ou imobiliária das equipes falhou.",
  );
  ensure(
    brokers.length === EXPECTED.currentBrokers + EXPECTED.historicalBrokers,
    "Total de corretores divergente.",
  );
  ensure(
    currentBrokers.length === EXPECTED.currentBrokers &&
      currentBrokers.every((broker) => broker.id_ksi !== null),
    "Validação dos corretores atuais falhou.",
  );
  ensure(
    historicalBrokers.length === EXPECTED.historicalBrokers &&
      historicalBrokers.every((broker) => broker.id_ksi === null),
    "Validação dos corretores históricos falhou.",
  );
  ensure(links.length === EXPECTED.teamLinks, "Total de vínculos divergente.");
  ensure(
    links.every(
      (link) => brokerIds.has(link.corretor_id) && teamIds.has(link.equipe_id),
    ),
    "Existe vínculo com corretor ou equipe inválida.",
  );
  ensure(
    [...currentLinkCounts.values()].every((count) => count === 1) &&
      currentLinkCounts.size === EXPECTED.currentBrokers,
    "Existe corretor com vínculo atual duplicado ou quantidade incorreta de vínculos abertos.",
  );
  ensure(meetings.length === EXPECTED.meetings, "Total de reuniões divergente.");
  ensure(
    meetings.every(
      (meeting) =>
        meeting.imobiliaria_id === created.agencyId &&
        meeting.created_by === null,
    ),
    "Validação da imobiliária ou autoria das reuniões falhou.",
  );
  ensure(presences.length === EXPECTED.presences, "Total de presenças divergente.");
  ensure(
    presences.every(
      (presence) =>
        brokerIds.has(presence.corretor_id) &&
        meetingIds.has(presence.reuniao_id) &&
        teamIds.has(presence.equipe_id) &&
        presence.registrado_por === null,
    ),
    "Existe presença sem referência válida ou com equipe de outra imobiliária.",
  );
  ensure(
    present === EXPECTED.present && absent === EXPECTED.absent,
    "Totais de presentes e ausentes divergentes.",
  );

  return {
    absent,
    currentBrokers: currentBrokers.length,
    historicalBrokers: historicalBrokers.length,
    meetings: meetings.length,
    present,
    presences: presences.length,
    teamLinks: links.length,
    teams: teams.length,
  };
}

async function executeImport() {
  ensure(
    process.env.IMPORT_CONFIRM === "FUHRO",
    "Importação real bloqueada. Defina IMPORT_CONFIRM=FUHRO explicitamente nesta execução.",
  );

  console.log("[IMPORT:EXECUTE] Confirmação explícita recebida.");
  console.log("[IMPORT:EXECUTE] Executando novamente o dry-run obrigatório...");
  const analysis = runDryRun();
  validateExpectedAnalysis(analysis);
  console.log("[IMPORT:EXECUTE] Totais do dry-run conferem com a base aprovada.");

  nextEnv.loadEnvConfig(process.cwd());
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  ensure(
    supabaseUrl && secretKey,
    "Credenciais server-side ausentes. Verifique NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY.",
  );

  const supabase = createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const agency = await findFuhroAgency(supabase);
  await assertBusinessTablesAreEmpty(supabase);
  console.log("[IMPORT:EXECUTE] Imobiliária Fuhro localizada e tabelas de negócio vazias.");

  const created = {
    agencyId: agency.id,
    brokerIds: [],
    meetingIds: [],
    teamIds: [],
  };
  let rollbackPerformed = false;

  try {
    const insertedTeams = await insertReturning(
      supabase,
      "equipes",
      analysis.teams.map((team) => ({
        ativo: true,
        id_ksi: team.ksiId,
        imobiliaria_id: agency.id,
        nome: team.name,
      })),
      "id,nome,id_ksi",
    );
    created.teamIds = insertedTeams.map((team) => team.id);
    const teamByName = mapBy(insertedTeams, "nome");
    console.log(`[IMPORT:EXECUTE] Equipes inseridas: ${insertedTeams.length}.`);

    const brokerPayload = [
      ...analysis.currentBrokers.map((broker) => ({
        ativo: true,
        id_ksi: broker.ksiId,
        imobiliaria_id: agency.id,
        nome: broker.name,
      })),
      ...analysis.historicalBrokers.map((broker) => ({
        ativo: false,
        id_ksi: null,
        imobiliaria_id: agency.id,
        nome: broker.name,
      })),
    ];
    const insertedBrokers = await insertReturning(
      supabase,
      "corretores",
      brokerPayload,
      "id,nome,id_ksi,ativo",
    );
    created.brokerIds = insertedBrokers.map((broker) => broker.id);
    const brokerByName = mapBy(insertedBrokers, "nome");
    console.log(`[IMPORT:EXECUTE] Corretores inseridos: ${insertedBrokers.length}.`);

    const periodByBroker = mapBy(analysis.teamHistory.periods, "brokerName");
    const historicalByName = mapBy(analysis.historicalBrokers, "name");
    const linkPayload = insertedBrokers.map((broker) => {
      const period = periodByBroker.get(broker.nome);
      const team = period ? teamByName.get(period.teamName) : null;
      const historical = historicalByName.get(broker.nome);

      ensure(period, `Período não resolvido para o corretor ${broker.nome}.`);
      ensure(team, `Equipe não resolvida para o corretor ${broker.nome}.`);

      return {
        corretor_id: broker.id,
        data_fim: historical ? historical.lastDate : null,
        data_inicio: period.startDate,
        equipe_id: team.id,
      };
    });
    const insertedLinks = await insertReturning(
      supabase,
      "corretor_equipes",
      linkPayload,
      "id,corretor_id,equipe_id",
    );
    console.log(`[IMPORT:EXECUTE] Vínculos inseridos: ${insertedLinks.length}.`);

    const insertedMeetings = await insertReturning(
      supabase,
      "reunioes",
      analysis.validMeetingDates.map((date) => ({
        created_by: null,
        data_reuniao: date,
        imobiliaria_id: agency.id,
        observacao: null,
        titulo: "Reunião de Corretores",
      })),
      "id,data_reuniao",
    );
    created.meetingIds = insertedMeetings.map((meeting) => meeting.id);
    const meetingByDate = mapBy(insertedMeetings, "data_reuniao");
    console.log(`[IMPORT:EXECUTE] Reuniões inseridas: ${insertedMeetings.length}.`);

    const importedAt = new Date().toISOString();
    const presencePayload = analysis.validPresenceRows.map((presence) => {
      const meeting = meetingByDate.get(presence.meetingDate);
      const broker = brokerByName.get(presence.brokerName);
      const team = teamByName.get(presence.teamName);

      ensure(
        meeting && broker && team,
        `Referência não resolvida antes da presença da linha ${presence.rowNumber}.`,
      );

      return {
        compareceu: presence.attended,
        corretor_id: broker.id,
        equipe_id: team.id,
        registrado_por: null,
        reuniao_id: meeting.id,
        updated_at: importedAt,
      };
    });
    const insertedPresences = await insertPresencesInBatches(
      supabase,
      presencePayload,
    );
    console.log(`[IMPORT:EXECUTE] Presenças inseridas: ${insertedPresences}.`);

    const report = await validateImportedData(supabase, created);
    console.log("[IMPORT:EXECUTE] Todas as validações pós-importação foram aprovadas.");

    return { report, rollbackPerformed };
  } catch (error) {
    console.error(
      "[IMPORT:EXECUTE] Falha detectada. Iniciando rollback compensatório...",
    );
    const rollbackErrors = await rollbackImport(supabase, created);
    rollbackPerformed = true;

    if (rollbackErrors.length > 0) {
      throw new Error(
        `${error instanceof Error ? error.message : "Falha desconhecida"} Rollback incompleto: ${rollbackErrors.join(" | ")}`,
      );
    }

    await assertBusinessTablesAreEmpty(supabase);
    throw new Error(
      `${error instanceof Error ? error.message : "Falha desconhecida"} Rollback compensatório concluído; as tabelas de negócio voltaram ao estado vazio.`,
    );
  }
}

try {
  const result = await executeImport();
  const separator = "=".repeat(68);

  console.log(`\n${separator}`);
  console.log("IMPORTAÇÃO FUHRO - RELATÓRIO PÓS-IMPORTAÇÃO");
  console.log(separator);
  console.log(`Equipes: ${result.report.teams}`);
  console.log(`Corretores ativos: ${result.report.currentBrokers}`);
  console.log(`Corretores históricos/inativos: ${result.report.historicalBrokers}`);
  console.log(`Corretor_equipes: ${result.report.teamLinks}`);
  console.log(`Reuniões: ${result.report.meetings}`);
  console.log(`Presentes: ${result.report.present}`);
  console.log(`Ausentes: ${result.report.absent}`);
  console.log(`Presenças: ${result.report.presences}`);
  console.log(`Rollback realizado: ${result.rollbackPerformed ? "sim" : "não"}`);
  console.log("Status: IMPORTAÇÃO VALIDADA COM SUCESSO");
  console.log(separator);
} catch (error) {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  console.error(`[IMPORT:EXECUTE] ${message}`);
  process.exitCode = 1;
}
