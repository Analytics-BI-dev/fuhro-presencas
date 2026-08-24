import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type DatabaseRecord = Record<string, unknown>;

export type MeetingStatus =
  | "Concluída"
  | "Em andamento"
  | "Pendente"
  | "Sem corretores";

export type MeetingListItem = {
  absentCount: number;
  date: string;
  id: string;
  observation: string | null;
  percentage: number;
  presentCount: number;
  reviewedCount: number;
  status: MeetingStatus;
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

function calculateStatus(total: number, reviewed: number): MeetingStatus {
  if (total === 0) {
    return "Sem corretores";
  }

  if (reviewed === 0) {
    return "Pendente";
  }

  return reviewed >= total ? "Concluída" : "Em andamento";
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
  const [meetingResult, brokerResult] = await Promise.all([
    supabase
      .from("reunioes")
      .select("id,data_reuniao,titulo,observacao")
      .eq("imobiliaria_id", agencyId)
      .order("data_reuniao", { ascending: false }),
    supabase
      .from("corretores")
      .select("id")
      .eq("imobiliaria_id", agencyId)
      .eq("ativo", true),
  ]);

  if (meetingResult.error) {
    failDataQuery("Falha ao buscar reunioes", meetingResult.error);
  }

  if (brokerResult.error) {
    failDataQuery("Falha ao buscar corretores ativos", brokerResult.error);
  }

  const meetingRows = (meetingResult.data ?? []) as DatabaseRecord[];
  const brokerIds = ((brokerResult.data ?? []) as DatabaseRecord[])
    .map((broker) => readText(broker, "id"))
    .filter((id): id is string => Boolean(id));
  const meetingIds = meetingRows
    .map((meeting) => readText(meeting, "id"))
    .filter((id): id is string => Boolean(id));
  const attendanceByMeeting = new Map<
    string,
    { absent: number; present: number; reviewed: number }
  >();

  if (meetingIds.length > 0 && brokerIds.length > 0) {
    const { data: attendanceData, error: attendanceError } = await supabase
      .from("presencas")
      .select("reuniao_id,corretor_id,compareceu")
      .in("reuniao_id", meetingIds)
      .in("corretor_id", brokerIds);

    if (attendanceError) {
      failDataQuery("Falha ao buscar presencas", attendanceError);
    }

    for (const attendance of (attendanceData ?? []) as DatabaseRecord[]) {
      const meetingId = readText(attendance, "reuniao_id");

      if (!meetingId || typeof attendance.compareceu !== "boolean") {
        continue;
      }

      const counts = attendanceByMeeting.get(meetingId) ?? {
        absent: 0,
        present: 0,
        reviewed: 0,
      };
      counts.reviewed += 1;

      if (attendance.compareceu) {
        counts.present += 1;
      } else {
        counts.absent += 1;
      }

      attendanceByMeeting.set(meetingId, counts);
    }
  }

  return meetingRows.flatMap((meeting): MeetingListItem[] => {
    const id = readText(meeting, "id");
    const date = readText(meeting, "data_reuniao");

    if (!id || !date) {
      return [];
    }

    const counts = attendanceByMeeting.get(id) ?? {
      absent: 0,
      present: 0,
      reviewed: 0,
    };

    return [
      {
        absentCount: counts.absent,
        date,
        id,
        observation: readText(meeting, "observacao"),
        percentage: calculatePercentage(counts.present, brokerIds.length),
        presentCount: counts.present,
        reviewedCount: counts.reviewed,
        status: calculateStatus(brokerIds.length, counts.reviewed),
        title: readText(meeting, "titulo"),
        totalBrokers: brokerIds.length,
      },
    ];
  });
}

export async function loadMeetingDetail(
  supabase: SupabaseClient,
  agencyId: string,
  meetingId: string,
): Promise<MeetingDetail | null> {
  const { data: meetingData, error: meetingError } = await supabase
    .from("reunioes")
    .select("id,data_reuniao,titulo,observacao")
    .eq("id", meetingId)
    .eq("imobiliaria_id", agencyId)
    .limit(2);

  if (meetingError) {
    failDataQuery("Falha ao buscar reuniao", meetingError);
  }

  const meetingRows = (meetingData ?? []) as DatabaseRecord[];

  if (meetingRows.length !== 1) {
    return null;
  }

  const meeting = meetingRows[0];
  const id = readText(meeting, "id");
  const date = readText(meeting, "data_reuniao");

  if (!id || !date) {
    return null;
  }

  const { data: brokerData, error: brokerError } = await supabase
    .from("corretores")
    .select("id,nome")
    .eq("imobiliaria_id", agencyId)
    .eq("ativo", true)
    .order("nome", { ascending: true });

  if (brokerError) {
    failDataQuery("Falha ao buscar corretores ativos", brokerError);
  }

  const brokerRows = (brokerData ?? []) as DatabaseRecord[];
  const brokerIds = brokerRows
    .map((broker) => readText(broker, "id"))
    .filter((brokerId): brokerId is string => Boolean(brokerId));
  const historicalTeams = await resolveHistoricalTeams(
    supabase,
    agencyId,
    date,
    brokerIds,
  );
  const attendanceByBroker = new Map<string, boolean>();

  if (brokerIds.length > 0) {
    const { data: attendanceData, error: attendanceError } = await supabase
      .from("presencas")
      .select("corretor_id,compareceu")
      .eq("reuniao_id", id)
      .in("corretor_id", brokerIds);

    if (attendanceError) {
      failDataQuery("Falha ao buscar presencas da reuniao", attendanceError);
    }

    for (const attendance of (attendanceData ?? []) as DatabaseRecord[]) {
      const brokerId = readText(attendance, "corretor_id");

      if (brokerId && typeof attendance.compareceu === "boolean") {
        attendanceByBroker.set(brokerId, attendance.compareceu);
      }
    }
  }

  const brokers = brokerRows.flatMap((broker): AttendanceBroker[] => {
    const brokerId = readText(broker, "id");

    if (!brokerId) {
      return [];
    }

    const teamId = historicalTeams.brokerTeamIds.get(brokerId) ?? null;

    return [
      {
        attendance: attendanceByBroker.has(brokerId)
          ? (attendanceByBroker.get(brokerId) ?? false)
          : null,
        id: brokerId,
        name: readText(broker, "nome") ?? "Corretor sem nome",
        teamId,
        teamName: teamId
          ? (historicalTeams.teamNames.get(teamId) ?? null)
          : null,
      },
    ];
  });
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
    date,
    id,
    observation: readText(meeting, "observacao"),
    percentage: calculatePercentage(presentCount, brokers.length),
    presentCount,
    reviewedCount,
    title: readText(meeting, "titulo"),
    totalBrokers: brokers.length,
    unreviewedCount: brokers.length - reviewedCount,
  };
}
