import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import XLSX from "xlsx";

const DEFAULT_WORKBOOK = "data/Fuhro - Presença de Reuniões.xlsx";
const EXPECTED_HEADERS = {
  Corretores: ["Nome e Sobrenome", "ID KSI"],
  Equipes: ["Equipe", "ID KSI"],
  Registro: ["Equipes", "Corretor", "Data da Reunião", "Compareceu"],
};
const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim().replace(/\s+/gu, " ");
}

function normalizeName(value) {
  return cleanText(value);
}

function relaxedName(value) {
  return normalizeName(value)
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function normalizeId(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value);
  }

  return cleanText(value) || null;
}

function isFilled(value) {
  return cleanText(value) !== "";
}

function isValidCalendarDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isoDate(year, month, day) {
  if (!isValidCalendarDate(year, month, day)) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseMeetingDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "2-digit",
      timeZone: SAO_PAULO_TIME_ZONE,
      year: "numeric",
    }).formatToParts(value);
    const dateParts = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );

    return isoDate(
      Number(dateParts.year),
      Number(dateParts.month),
      Number(dateParts.day),
    );
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? isoDate(parsed.y, parsed.m, parsed.d) : null;
  }

  const text = cleanText(value);
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/u.exec(text);

  if (isoMatch) {
    return isoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const brazilianMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/u.exec(text);

  if (brazilianMatch) {
    return isoDate(
      Number(brazilianMatch[3]),
      Number(brazilianMatch[2]),
      Number(brazilianMatch[1]),
    );
  }

  return null;
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function previousDay(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);

  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

function levenshtein(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }

    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

function groupBy(items, keySelector) {
  const groups = new Map();

  for (const item of items) {
    const key = keySelector(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  return groups;
}

function getSheetRows(workbook, sheetName) {
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error(`A aba obrigatória "${sheetName}" não foi encontrada.`);
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    blankrows: true,
    cellDates: true,
    defval: null,
    header: 1,
    raw: true,
  });
  const expectedHeaders = EXPECTED_HEADERS[sheetName];
  const actualHeaders = (rows[0] ?? []).slice(0, expectedHeaders.length).map(cleanText);

  if (
    actualHeaders.length !== expectedHeaders.length ||
    actualHeaders.some((header, index) => header !== expectedHeaders[index])
  ) {
    throw new Error(
      `Cabeçalhos inválidos na aba "${sheetName}". Esperado: ${expectedHeaders.join(" | ")}. Encontrado: ${actualHeaders.join(" | ") || "nenhum"}.`,
    );
  }

  return rows
    .slice(1)
    .map((cells, index) => ({ cells, rowNumber: index + 2 }))
    .filter(({ cells }) => cells.some(isFilled));
}

function findPossibleNames(currentBrokers, registryBrokers) {
  const sourcesByName = new Map();

  for (const broker of currentBrokers) {
    const sources = sourcesByName.get(broker.name) ?? new Set();
    sources.add("Corretores");
    sourcesByName.set(broker.name, sources);
  }

  for (const broker of registryBrokers) {
    const sources = sourcesByName.get(broker.name) ?? new Set();
    sources.add("Registro");
    sourcesByName.set(broker.name, sources);
  }

  const names = [...sourcesByName.keys()].sort((left, right) =>
    left.localeCompare(right, "pt-BR"),
  );
  const possibilities = [];

  for (let leftIndex = 0; leftIndex < names.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < names.length; rightIndex += 1) {
      const left = names[leftIndex];
      const right = names[rightIndex];
      const relaxedLeft = relaxedName(left);
      const relaxedRight = relaxedName(right);

      if (!relaxedLeft || !relaxedRight) {
        continue;
      }

      const distance = levenshtein(relaxedLeft, relaxedRight);
      const similarity = 1 - distance / Math.max(relaxedLeft.length, relaxedRight.length);
      const sameRelaxedName = relaxedLeft === relaxedRight;
      const isVerySimilar =
        relaxedLeft[0] === relaxedRight[0] && distance <= 2 && similarity >= 0.88;

      if (!sameRelaxedName && !isVerySimilar) {
        continue;
      }

      possibilities.push({
        detail: sameRelaxedName
          ? "Diferem apenas por caixa, acentuação ou pontuação. Não mesclados."
          : `Similaridade ${(similarity * 100).toFixed(1)}% (distância ${distance}). Não mesclados.`,
        left,
        leftSources: [...sourcesByName.get(left)].join(", "),
        right,
        rightSources: [...sourcesByName.get(right)].join(", "),
      });
    }
  }

  return possibilities;
}

function inferTeamPeriods(registryRows) {
  const evidence = registryRows.filter(
    (row) => row.brokerName && row.teamName && row.meetingDate,
  );
  const evidenceByBroker = groupBy(evidence, (row) => row.brokerName);
  const periods = [];
  const ambiguities = [];

  for (const [brokerName, brokerRows] of evidenceByBroker) {
    const rowsByDate = groupBy(brokerRows, (row) => row.meetingDate);
    const chronologicalEvidence = [];

    for (const [meetingDate, sameDateRows] of rowsByDate) {
      const teams = [...new Set(sameDateRows.map((row) => row.teamName))];

      if (teams.length > 1) {
        ambiguities.push({
          brokerName,
          detail: `Equipes conflitantes na mesma data: ${teams.join(", ")}. Data excluída da inferência.`,
          meetingDate,
          rows: sameDateRows.map((row) => row.rowNumber),
        });
        continue;
      }

      chronologicalEvidence.push({
        meetingDate,
        rowNumber: sameDateRows[0].rowNumber,
        teamName: teams[0],
      });
    }

    chronologicalEvidence.sort(
      (left, right) =>
        left.meetingDate.localeCompare(right.meetingDate) ||
        left.rowNumber - right.rowNumber,
    );
    const brokerPeriods = [];

    for (const evidenceRow of chronologicalEvidence) {
      const currentPeriod = brokerPeriods.at(-1);

      if (!currentPeriod || currentPeriod.teamName !== evidenceRow.teamName) {
        brokerPeriods.push({
          brokerName,
          endDate: null,
          evidenceCount: 1,
          startDate: evidenceRow.meetingDate,
          teamName: evidenceRow.teamName,
        });
      } else {
        currentPeriod.evidenceCount += 1;
      }
    }

    for (let index = 0; index < brokerPeriods.length - 1; index += 1) {
      brokerPeriods[index].endDate = previousDay(brokerPeriods[index + 1].startDate);
    }

    periods.push(...brokerPeriods);
  }

  return { ambiguities, periods };
}

function printSection(title) {
  console.log(`\n### ${title}`);
}

function printTable(headers, rows) {
  if (rows.length === 0) {
    console.log("Nenhum registro.");
    return;
  }

  console.log(headers.join(" | "));
  console.log(headers.map(() => "---").join(" | "));

  for (const row of rows) {
    console.log(row.map((value) => String(value ?? "—")).join(" | "));
  }
}

export function runDryRun(
  inputArgument = process.argv[2] || DEFAULT_WORKBOOK,
) {
  const inputPath = path.resolve(process.cwd(), inputArgument);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Planilha não encontrada: ${inputPath}`);
  }

  const workbook = XLSX.readFile(inputPath, {
    cellDates: true,
    dense: true,
    raw: true,
  });
  const brokerSourceRows = getSheetRows(workbook, "Corretores");
  const teamSourceRows = getSheetRows(workbook, "Equipes");
  const registrySourceRows = getSheetRows(workbook, "Registro");

  const brokerRows = brokerSourceRows.map(({ cells, rowNumber }) => ({
    ksiId: normalizeId(cells[1]),
    name: normalizeName(cells[0]),
    rowNumber,
  }));
  const teamRows = teamSourceRows.map(({ cells, rowNumber }) => ({
    ksiId: normalizeId(cells[1]),
    name: cleanText(cells[0]),
    rowNumber,
  }));
  const registryRows = registrySourceRows.map(({ cells, rowNumber }) => {
    const attendanceText = cleanText(cells[3]);
    const brokerName = normalizeName(cells[1]);
    const meetingDate = parseMeetingDate(cells[2]);
    const teamName = cleanText(cells[0]);
    const problems = [];

    if (!teamName) {
      problems.push("Equipe vazia");
    }

    if (!brokerName) {
      problems.push("Corretor vazio");
    }

    if (!isFilled(cells[2])) {
      problems.push("Data da Reunião vazia");
    } else if (!meetingDate) {
      problems.push(`Data inválida: ${cleanText(cells[2])}`);
    }

    if (!attendanceText) {
      problems.push("Compareceu vazio");
    } else if (attendanceText !== "Sim" && attendanceText !== "Não") {
      problems.push(`Compareceu inválido: ${attendanceText}`);
    }

    return {
      attended:
        attendanceText === "Sim"
          ? true
          : attendanceText === "Não"
            ? false
            : null,
      attendanceText,
      brokerName,
      meetingDate,
      problems,
      rowNumber,
      teamName,
    };
  });

  const namedBrokerRows = brokerRows.filter((broker) => broker.name);
  const currentBrokerGroups = groupBy(namedBrokerRows, (broker) => broker.name);
  const currentBrokers = [...currentBrokerGroups.entries()].map(
    ([name, rows]) => ({
      active: true,
      ksiId: rows.find((row) => row.ksiId)?.ksiId ?? null,
      name,
      rows: rows.map((row) => row.rowNumber),
      type: "atual",
    }),
  );
  const currentBrokerNames = new Set(currentBrokers.map((broker) => broker.name));
  const registryNamedRows = registryRows.filter((row) => row.brokerName);
  const registryBrokerGroups = groupBy(
    registryNamedRows,
    (row) => row.brokerName,
  );
  const registryBrokers = [...registryBrokerGroups.entries()].map(
    ([name, rows]) => ({ name, rows }),
  );
  const historicalBrokers = registryBrokers
    .filter((broker) => !currentBrokerNames.has(broker.name))
    .map((broker) => {
      const datedRows = broker.rows
        .filter((row) => row.meetingDate)
        .sort((left, right) =>
          left.meetingDate.localeCompare(right.meetingDate),
        );
      const latestRow = datedRows.at(-1);

      return {
        active: false,
        firstDate: datedRows[0]?.meetingDate ?? null,
        ksiId: null,
        lastDate: latestRow?.meetingDate ?? null,
        latestTeam: latestRow?.teamName || null,
        name: broker.name,
        type: "historico",
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

  const currentNameDuplicates = [...currentBrokerGroups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([name, rows]) => ({
      name,
      rows: rows.map((row) => row.rowNumber),
    }));
  const brokerKsiDuplicates = [...groupBy(
    namedBrokerRows.filter((broker) => broker.ksiId),
    (broker) => broker.ksiId,
  ).entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([ksiId, rows]) => ({
      ksiId,
      names: rows.map((row) => row.name),
      rows: rows.map((row) => row.rowNumber),
    }));
  const currentBrokersWithoutKsi = namedBrokerRows.filter(
    (broker) => !broker.ksiId,
  );

  const namedTeamRows = teamRows.filter((team) => team.name);
  const teamGroups = groupBy(namedTeamRows, (team) => team.name);
  const teams = [...teamGroups.entries()].map(([name, rows]) => ({
    ksiId: rows.find((row) => row.ksiId)?.ksiId ?? null,
    name,
    rows: rows.map((row) => row.rowNumber),
  }));
  const teamsWithoutKsi = teams.filter((team) => !team.ksiId);
  const teamNames = new Set(teams.map((team) => team.name));
  const unknownTeamGroups = groupBy(
    registryRows.filter((row) => row.teamName && !teamNames.has(row.teamName)),
    (row) => row.teamName,
  );
  const unknownTeams = [...unknownTeamGroups.entries()].map(([name, rows]) => ({
    name,
    rows: rows.map((row) => row.rowNumber),
  }));
  const duplicateTeamNames = [...teamGroups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([name, rows]) => ({
      name,
      rows: rows.map((row) => row.rowNumber),
    }));
  const duplicateTeamKsi = [...groupBy(
    namedTeamRows.filter((team) => team.ksiId),
    (team) => team.ksiId,
  ).entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([ksiId, rows]) => ({
      ksiId,
      names: rows.map((row) => row.name),
      rows: rows.map((row) => row.rowNumber),
    }));

  const validPresenceRows = registryRows.filter(
    (row) => row.problems.length === 0,
  );
  const invalidPresenceRows = registryRows.filter(
    (row) => row.problems.length > 0,
  );
  const validMeetingDates = [
    ...new Set(
      registryRows
        .map((row) => row.meetingDate)
        .filter((date) => Boolean(date)),
    ),
  ].sort();
  const meetingCounts = [...groupBy(
    validPresenceRows,
    (row) => row.meetingDate,
  ).entries()]
    .map(([meetingDate, rows]) => ({ meetingDate, presenceCount: rows.length }))
    .sort((left, right) => left.meetingDate.localeCompare(right.meetingDate));
  const duplicatePresenceGroups = [...groupBy(
    registryRows.filter((row) => row.meetingDate && row.brokerName),
    (row) => `${row.meetingDate}\u0000${row.brokerName}`,
  ).entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([, rows]) => ({
      brokerName: rows[0].brokerName,
      meetingDate: rows[0].meetingDate,
      rows,
    }));
  const possibleNames = findPossibleNames(currentBrokers, registryBrokers);
  const teamHistory = inferTeamPeriods(registryRows);
  const presentCount = validPresenceRows.filter(
    (row) => row.attended === true,
  ).length;
  const absentCount = validPresenceRows.filter(
    (row) => row.attended === false,
  ).length;

  const inconsistencyCount =
    invalidPresenceRows.length +
    currentNameDuplicates.length +
    brokerKsiDuplicates.length +
    currentBrokersWithoutKsi.length +
    unknownTeams.length +
    duplicateTeamNames.length +
    duplicateTeamKsi.length +
    teamsWithoutKsi.length +
    possibleNames.length +
    duplicatePresenceGroups.length +
    teamHistory.ambiguities.length;
  const separator = "=".repeat(68);

  console.log(separator);
  console.log("IMPORTAÇÃO FUHRO - DRY RUN");
  console.log(separator);
  console.log(`Arquivo: ${path.relative(process.cwd(), inputPath)}`);
  console.log("Modo: SOMENTE LEITURA (nenhuma conexão com Supabase)");
  console.log("Linhas totalmente vazias ou apenas formatadas não são contabilizadas.");
  console.log("");
  console.log(`1. Linhas preenchidas da aba Corretores: ${brokerRows.length}`);
  console.log(`2. Corretores atuais únicos: ${currentBrokers.length}`);
  console.log(`3. Corretores únicos encontrados no Registro: ${registryBrokers.length}`);
  console.log(`4. Corretores históricos/inativos: ${historicalBrokers.length}`);
  console.log(
    "   Classificação: atuais => ativo=true; históricos => ativo=false, id_ksi=null, tipo=historico.",
  );
  console.log(`5. Equipes catalogadas únicas: ${teams.length}`);
  console.log(`6. Datas distintas de reunião: ${validMeetingDates.length}`);
  console.log(`7. Linhas preenchidas do Registro: ${registryRows.length}`);
  console.log(`8. Presenças válidas: ${validPresenceRows.length}`);
  console.log(`9. Linhas inválidas: ${invalidPresenceRows.length}`);
  console.log(`10. Sim: ${presentCount}`);
  console.log(`11. Não: ${absentCount}`);
  console.log(`12. Primeira reunião: ${formatDate(validMeetingDates[0])}`);
  console.log(`13. Última reunião: ${formatDate(validMeetingDates.at(-1))}`);
  console.log(`14. Corretores históricos sem ID KSI: ${historicalBrokers.length}`);
  console.log(`15. IDs KSI duplicados em Corretores: ${brokerKsiDuplicates.length}`);
  console.log(`16. Nomes duplicados em Corretores: ${currentNameDuplicates.length}`);
  console.log(`17. Possíveis nomes equivalentes/inconsistentes: ${possibleNames.length}`);
  console.log(`18. Equipes desconhecidas no Registro: ${unknownTeams.length}`);
  console.log(`    Equipes catalogadas sem ID KSI: ${teamsWithoutKsi.length}`);
  console.log(`19. Datas vazias ou inválidas: ${registryRows.filter((row) => row.problems.some((problem) => problem.startsWith("Data"))).length}`);
  console.log(`20. Presenças vazias ou inválidas: ${registryRows.filter((row) => row.problems.some((problem) => problem.startsWith("Compareceu"))).length}`);
  console.log(`21. Duplicidades data + corretor: ${duplicatePresenceGroups.length}`);
  console.log("");
  console.log(`Problemas encontrados (categorias/linhas): ${inconsistencyCount}`);
  console.log(separator);

  printSection("CORRETORES HISTÓRICOS SEM ID KSI");
  printTable(
    ["Nome", "Equipe mais recente", "Primeira ocorrência", "Última ocorrência"],
    historicalBrokers.map((broker) => [
      broker.name,
      broker.latestTeam ?? "—",
      formatDate(broker.firstDate),
      formatDate(broker.lastDate),
    ]),
  );

  printSection("POSSÍVEIS INCONSISTÊNCIAS DE NOMES");
  printTable(
    ["Nome A", "Origem A", "Nome B", "Origem B", "Detalhe"],
    possibleNames.map((item) => [
      item.left,
      item.leftSources,
      item.right,
      item.rightSources,
      item.detail,
    ]),
  );

  printSection("LINHAS INVÁLIDAS DO REGISTRO");
  printTable(
    ["Linha", "Equipe", "Corretor", "Data", "Compareceu", "Problemas"],
    invalidPresenceRows.map((row) => [
      row.rowNumber,
      row.teamName || "—",
      row.brokerName || "—",
      formatDate(row.meetingDate),
      row.attendanceText || "—",
      row.problems.join("; "),
    ]),
  );

  printSection("DUPLICIDADES DATA + CORRETOR (ERRO)");
  printTable(
    ["Data", "Corretor", "Linhas", "Equipes", "Compareceu"],
    duplicatePresenceGroups.map((duplicate) => [
      formatDate(duplicate.meetingDate),
      duplicate.brokerName,
      duplicate.rows.map((row) => row.rowNumber).join(", "),
      duplicate.rows.map((row) => row.teamName || "—").join(", "),
      duplicate.rows.map((row) => row.attendanceText || "—").join(", "),
    ]),
  );

  printSection("IDS KSI DUPLICADOS EM CORRETORES");
  printTable(
    ["ID KSI", "Nomes", "Linhas"],
    brokerKsiDuplicates.map((duplicate) => [
      duplicate.ksiId,
      duplicate.names.join(", "),
      duplicate.rows.join(", "),
    ]),
  );

  printSection("NOMES DUPLICADOS EM CORRETORES");
  printTable(
    ["Nome", "Linhas"],
    currentNameDuplicates.map((duplicate) => [
      duplicate.name,
      duplicate.rows.join(", "),
    ]),
  );

  printSection("CORRETORES ATUAIS SEM ID KSI");
  printTable(
    ["Nome", "Linha"],
    currentBrokersWithoutKsi.map((broker) => [broker.name, broker.rowNumber]),
  );

  printSection("EQUIPES DESCONHECIDAS NO REGISTRO");
  printTable(
    ["Equipe", "Linhas"],
    unknownTeams.map((team) => [team.name, team.rows.join(", ")]),
  );

  printSection("EQUIPES CATALOGADAS SEM ID KSI");
  printTable(
    ["Equipe", "Linhas", "Tratamento proposto"],
    teamsWithoutKsi.map((team) => [
      team.name,
      team.rows.join(", "),
      "Manter ID KSI nulo; não inventar valor.",
    ]),
  );

  printSection("DUPLICIDADES NA ABA EQUIPES");
  printTable(
    ["Tipo", "Valor", "Detalhe"],
    [
      ...duplicateTeamNames.map((duplicate) => [
        "Nome duplicado",
        duplicate.name,
        `Linhas ${duplicate.rows.join(", ")}`,
      ]),
      ...duplicateTeamKsi.map((duplicate) => [
        "ID KSI duplicado",
        duplicate.ksiId,
        `${duplicate.names.join(", ")} (linhas ${duplicate.rows.join(", ")})`,
      ]),
    ],
  );

  printSection("AMBIGUIDADES DE HISTÓRICO DE EQUIPE");
  printTable(
    ["Corretor", "Data", "Linhas", "Detalhe"],
    teamHistory.ambiguities.map((ambiguity) => [
      ambiguity.brokerName,
      formatDate(ambiguity.meetingDate),
      ambiguity.rows.join(", "),
      ambiguity.detail,
    ]),
  );

  printSection("PROPOSTA CONCEITUAL DE CORRETOR_EQUIPES");
  console.log(
    "Estratégia: primeira ocorrência conhecida inicia o período; o período termina no dia anterior à primeira ocorrência da equipe seguinte; a equipe mais recente fica com data_fim nula. Evidências com equipes conflitantes na mesma data são excluídas da inferência.",
  );
  printTable(
    ["Corretor", "Equipe", "Data início", "Data fim", "Evidências"],
    teamHistory.periods.map((period) => [
      period.brokerName,
      period.teamName,
      formatDate(period.startDate),
      period.endDate ? formatDate(period.endDate) : "null",
      period.evidenceCount,
    ]),
  );

  printSection("REUNIÕES E QUANTIDADE DE PRESENÇAS VÁLIDAS");
  printTable(
    ["Data", "Presenças"],
    meetingCounts.map((meeting) => [
      formatDate(meeting.meetingDate),
      meeting.presenceCount,
    ]),
  );

  console.log(`\n${separator}`);
  console.log(
    inconsistencyCount > 0
      ? "DRY RUN CONCLUÍDO COM PENDÊNCIAS — nenhum dado foi persistido."
      : "DRY RUN CONCLUÍDO SEM PENDÊNCIAS — nenhum dado foi persistido.",
  );
  console.log(separator);

  return {
    absentCount,
    currentBrokers,
    duplicatePresenceGroups,
    historicalBrokers,
    inputPath,
    invalidPresenceRows,
    possibleNames,
    presentCount,
    registryBrokers,
    teamHistory,
    teams,
    unknownTeams,
    validMeetingDates,
    validPresenceRows,
  };
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    runDryRun();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro desconhecido";
    console.error(`[IMPORT:DRY] ${message}`);
    process.exitCode = 1;
  }
}
