import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  deriveExpectedAttendance,
  type AttendanceLink,
  type ExplicitAttendance,
  type ExpectedAttendance,
} from "@/lib/attendance-rules";

type DatabaseRecord = Record<string, unknown>;

export type ParticipationBroker = {
  active: boolean;
  id: string;
  ksiId: string | null;
  name: string;
};

export type ParticipationMeeting = {
  date: string;
  id: string;
  observation: string | null;
  title: string | null;
};

export type ParticipationTeam = {
  active: boolean;
  id: string;
  ksiId: string | null;
  name: string;
};

export type ParticipationLink = AttendanceLink & {
  id: string | null;
};

export type AgencyParticipationData = {
  brokers: ParticipationBroker[];
  facts: ExpectedAttendance[];
  links: ParticipationLink[];
  meetings: ParticipationMeeting[];
  presences: ExplicitAttendance[];
  teams: ParticipationTeam[];
};

type LoadParticipationOptions = {
  deriveExpectedFacts?: boolean;
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

function failQuery(stage: string, error: { code?: string; message?: string }) {
  const code = error.code?.trim() || "UNKNOWN";
  const message =
    error.message?.replace(/\s+/g, " ").trim().slice(0, 500) ||
    "Erro sem mensagem";

  console.error(`[ATTENDANCE] ${stage}: code=${code} message=${message}`);
  throw new Error("Não foi possível calcular os dados de presença.");
}

export async function loadAgencyParticipation(
  supabase: SupabaseClient,
  agencyId: string,
  options: LoadParticipationOptions = {},
): Promise<AgencyParticipationData> {
  const [meetingResult, brokerResult, teamResult] = await Promise.all([
    supabase
      .from("reunioes")
      .select("id,data_reuniao,titulo,observacao")
      .eq("imobiliaria_id", agencyId)
      .order("data_reuniao", { ascending: false }),
    supabase
      .from("corretores")
      .select("id,nome,id_ksi,ativo")
      .eq("imobiliaria_id", agencyId)
      .order("nome", { ascending: true }),
    supabase
      .from("equipes")
      .select("id,nome,id_ksi,ativo")
      .eq("imobiliaria_id", agencyId)
      .order("nome", { ascending: true }),
  ]);

  if (meetingResult.error) {
    failQuery("Falha ao buscar reunioes", meetingResult.error);
  }

  if (brokerResult.error) {
    failQuery("Falha ao buscar corretores", brokerResult.error);
  }

  if (teamResult.error) {
    failQuery("Falha ao buscar equipes", teamResult.error);
  }

  const meetings = ((meetingResult.data ?? []) as DatabaseRecord[]).flatMap(
    (meeting): ParticipationMeeting[] => {
      const id = readText(meeting, "id");
      const date = readText(meeting, "data_reuniao");

      return id && date
        ? [
            {
              date,
              id,
              observation: readText(meeting, "observacao"),
              title: readText(meeting, "titulo"),
            },
          ]
        : [];
    },
  );
  const brokers = ((brokerResult.data ?? []) as DatabaseRecord[]).flatMap(
    (broker): ParticipationBroker[] => {
      const id = readText(broker, "id");

      return id
        ? [
            {
              active: broker.ativo !== false,
              id,
              ksiId: readText(broker, "id_ksi"),
              name: readText(broker, "nome") ?? "Corretor sem nome",
            },
          ]
        : [];
    },
  );
  const teams = ((teamResult.data ?? []) as DatabaseRecord[]).flatMap(
    (team): ParticipationTeam[] => {
      const id = readText(team, "id");

      return id
        ? [
            {
              active: team.ativo !== false,
              id,
              ksiId: readText(team, "id_ksi"),
              name: readText(team, "nome") ?? "Equipe sem nome",
            },
          ]
        : [];
    },
  );
  const brokerIds = brokers.map((broker) => broker.id);
  const meetingIds = meetings.map((meeting) => meeting.id);
  const teamIds = new Set(teams.map((team) => team.id));
  const [linkResult, presenceResult] = await Promise.all([
    brokerIds.length > 0
      ? supabase
          .from("corretor_equipes")
          .select("id,corretor_id,equipe_id,data_inicio,data_fim")
          .in("corretor_id", brokerIds)
      : Promise.resolve({ data: [], error: null }),
    meetingIds.length > 0
      ? supabase
          .from("presencas")
          .select("reuniao_id,corretor_id,equipe_id,compareceu")
          .in("reuniao_id", meetingIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (linkResult.error) {
    failQuery("Falha ao buscar corretor_equipes", linkResult.error);
  }

  if (presenceResult.error) {
    failQuery("Falha ao buscar presencas", presenceResult.error);
  }

  const links = ((linkResult.data ?? []) as DatabaseRecord[]).flatMap(
    (link): ParticipationLink[] => {
      const brokerId = readText(link, "corretor_id");
      const teamId = readText(link, "equipe_id");
      const startDate = readText(link, "data_inicio");

      return brokerId && teamId && startDate && teamIds.has(teamId)
        ? [
            {
              brokerId,
              endDate: readText(link, "data_fim"),
              id: readText(link, "id"),
              startDate,
              teamId,
            },
          ]
        : [];
    },
  );
  const presences = ((presenceResult.data ?? []) as DatabaseRecord[]).flatMap(
    (presence): ExplicitAttendance[] => {
      const meetingId = readText(presence, "reuniao_id");
      const brokerId = readText(presence, "corretor_id");

      return meetingId && brokerId && typeof presence.compareceu === "boolean"
        ? [
            {
              attended: presence.compareceu,
              brokerId,
              meetingId,
              teamId: (() => {
                const teamId = readText(presence, "equipe_id");
                return teamId && teamIds.has(teamId) ? teamId : null;
              })(),
            },
          ]
        : [];
    },
  );
  const facts =
    options.deriveExpectedFacts === false
      ? []
      : deriveExpectedAttendance(meetings, links, presences);

  return { brokers, facts, links, meetings, presences, teams };
}
