"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthorization } from "@/lib/access";
import { resolveHistoricalTeams } from "@/lib/meeting-data";

type DatabaseRecord = Record<string, unknown>;

export type SaveAttendanceResult = {
  message: string;
  ok: boolean;
};

function readText(formData: FormData, field: string) {
  const value = formData.get(field);

  return typeof value === "string" ? value.trim() : "";
}

function readOptionalText(formData: FormData, field: string, maxLength: number) {
  const value = readText(formData, field);

  if (!value) {
    return { valid: true as const, value: null };
  }

  if (value.length > maxLength) {
    return { valid: false as const, value: null };
  }

  return { valid: true as const, value };
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsedDate = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === value
  );
}

function readId(record: DatabaseRecord, key = "id") {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function findMeeting(
  context: Awaited<ReturnType<typeof requireAuthorization>>,
  meetingId: string,
) {
  const { data, error } = await context.supabase
    .from("reunioes")
    .select("id,data_reuniao")
    .eq("id", meetingId)
    .eq("imobiliaria_id", context.imobiliaria_id)
    .limit(2);
  const meetings = (data ?? []) as DatabaseRecord[];

  if (error || meetings.length !== 1) {
    return null;
  }

  return meetings[0];
}

export async function createMeeting(formData: FormData) {
  const context = await requireAuthorization();

  if (!context.permissions.canCreate) {
    redirect("/reunioes?erro=sem-permissao");
  }

  const date = readText(formData, "data_reuniao");
  const title = readOptionalText(formData, "titulo", 180);
  const observation = readOptionalText(formData, "observacao", 2_000);

  if (!isValidDate(date)) {
    redirect("/reunioes?acao=nova&erro=data-invalida");
  }

  if (!title.valid || !observation.valid) {
    redirect("/reunioes?acao=nova&erro=campos-invalidos");
  }

  const { data, error } = await context.supabase
    .from("reunioes")
    .insert({
      created_by: context.user.id,
      data_reuniao: date,
      imobiliaria_id: context.imobiliaria_id,
      observacao: observation.value,
      titulo: title.value,
    })
    .select("id")
    .single();
  const meetingId = data ? readId(data as DatabaseRecord) : null;

  if (error || !meetingId) {
    redirect("/reunioes?acao=nova&erro=nao-foi-possivel-salvar");
  }

  revalidatePath("/reunioes");
  redirect(`/reunioes/${encodeURIComponent(meetingId)}?sucesso=reuniao-criada`);
}

export async function updateMeeting(formData: FormData) {
  const context = await requireAuthorization();

  if (!context.permissions.canEdit) {
    redirect("/reunioes?erro=sem-permissao");
  }

  const meetingId = readText(formData, "reuniao_id");
  const date = readText(formData, "data_reuniao");
  const title = readOptionalText(formData, "titulo", 180);
  const observation = readOptionalText(formData, "observacao", 2_000);

  if (!meetingId || meetingId.length > 100) {
    redirect("/reunioes?erro=reuniao-invalida");
  }

  if (!isValidDate(date)) {
    redirect(
      `/reunioes?editar=${encodeURIComponent(meetingId)}&erro=data-invalida`,
    );
  }

  if (!title.valid || !observation.valid) {
    redirect(
      `/reunioes?editar=${encodeURIComponent(meetingId)}&erro=campos-invalidos`,
    );
  }

  if (!(await findMeeting(context, meetingId))) {
    redirect("/reunioes?erro=reuniao-invalida");
  }

  const { error } = await context.supabase
    .from("reunioes")
    .update({
      data_reuniao: date,
      observacao: observation.value,
      titulo: title.value,
    })
    .eq("id", meetingId)
    .eq("imobiliaria_id", context.imobiliaria_id);

  if (error) {
    redirect(
      `/reunioes?editar=${encodeURIComponent(meetingId)}&erro=nao-foi-possivel-salvar`,
    );
  }

  revalidatePath("/reunioes");
  revalidatePath(`/reunioes/${meetingId}`);
  redirect("/reunioes?sucesso=reuniao-atualizada");
}

export async function saveAttendance(
  meetingId: string,
  input: unknown,
): Promise<SaveAttendanceResult> {
  const context = await requireAuthorization();

  if (!context.permissions.canEdit) {
    return {
      message: "Seu perfil possui acesso somente para consulta.",
      ok: false,
    };
  }

  if (!meetingId || meetingId.length > 100 || !Array.isArray(input)) {
    return { message: "Os dados enviados são inválidos.", ok: false };
  }

  if (input.length === 0) {
    return {
      message: "Marque ao menos um corretor antes de salvar.",
      ok: false,
    };
  }

  if (input.length > 5_000) {
    return { message: "A lista enviada excede o limite permitido.", ok: false };
  }

  const entries: Array<{ brokerId: string; attended: boolean }> = [];

  for (const entry of input) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof (entry as { brokerId?: unknown }).brokerId !== "string" ||
      typeof (entry as { attended?: unknown }).attended !== "boolean"
    ) {
      return { message: "Os dados enviados são inválidos.", ok: false };
    }

    const brokerId = (entry as { brokerId: string }).brokerId.trim();

    if (!brokerId || brokerId.length > 100) {
      return { message: "Os dados enviados são inválidos.", ok: false };
    }

    entries.push({
      attended: (entry as { attended: boolean }).attended,
      brokerId,
    });
  }

  const uniqueBrokerIds = new Set(entries.map((entry) => entry.brokerId));

  if (uniqueBrokerIds.size !== entries.length) {
    return {
      message: "A lista contém corretores duplicados.",
      ok: false,
    };
  }

  const meeting = await findMeeting(context, meetingId);
  const meetingDate = meeting ? readId(meeting, "data_reuniao") : null;

  if (!meeting || !meetingDate) {
    return {
      message: "A reunião não pertence à imobiliária atual.",
      ok: false,
    };
  }

  const brokerIds = [...uniqueBrokerIds];
  const { data: brokerData, error: brokerError } = await context.supabase
    .from("corretores")
    .select("id")
    .eq("imobiliaria_id", context.imobiliaria_id)
    .in("id", brokerIds);

  if (brokerError) {
    return {
      message: "Não foi possível validar os corretores selecionados.",
      ok: false,
    };
  }

  const brokerRecords = (brokerData ?? []) as DatabaseRecord[];
  const validBrokerIds = new Set(
    brokerRecords
      .map((broker) => readId(broker))
      .filter((id): id is string => Boolean(id)),
  );

  if (
    validBrokerIds.size !== brokerIds.length ||
    brokerIds.some((brokerId) => !validBrokerIds.has(brokerId))
  ) {
    return {
      message: "Há um corretor inválido ou de outra imobiliária na lista.",
      ok: false,
    };
  }

  const { data: linkData, error: linkError } = await context.supabase
    .from("corretor_equipes")
    .select("corretor_id,data_inicio,data_fim")
    .in("corretor_id", brokerIds)
    .lte("data_inicio", meetingDate);

  if (linkError) {
    return {
      message: "Não foi possível validar os vínculos históricos dos corretores.",
      ok: false,
    };
  }

  const expectedBrokerIds = new Set(
    ((linkData ?? []) as DatabaseRecord[]).flatMap((link) => {
      const brokerId = readId(link, "corretor_id");
      const endDate = readId(link, "data_fim");

      return brokerId && (!endDate || endDate >= meetingDate)
        ? [brokerId]
        : [];
    }),
  );

  if (brokerIds.some((brokerId) => !expectedBrokerIds.has(brokerId))) {
    return {
      message:
        "Há um corretor sem vínculo válido com equipe na data da reunião.",
      ok: false,
    };
  }

  const historicalTeams = await resolveHistoricalTeams(
    context.supabase,
    context.imobiliaria_id,
    meetingDate,
    brokerIds,
  );

  if (
    brokerIds.some(
      (brokerId) => !historicalTeams.brokerTeamIds.has(brokerId),
    )
  ) {
    return {
      message:
        "Há um corretor sem equipe válida da imobiliária na data da reunião.",
      ok: false,
    };
  }

  const updatedAt = new Date().toISOString();
  const rows = entries.map((entry) => ({
    compareceu: entry.attended,
    corretor_id: entry.brokerId,
    equipe_id: historicalTeams.brokerTeamIds.get(entry.brokerId) ?? null,
    registrado_por: context.user.id,
    reuniao_id: meetingId,
    updated_at: updatedAt,
  }));
  const { error: saveError } = await context.supabase
    .from("presencas")
    .upsert(rows, { onConflict: "reuniao_id,corretor_id" });

  if (saveError) {
    return {
      message: "Não foi possível salvar a presença. Tente novamente.",
      ok: false,
    };
  }

  revalidatePath("/reunioes");
  revalidatePath(`/reunioes/${meetingId}`);
  revalidatePath("/corretores");
  revalidatePath("/historico");

  return {
    message: `Presença salva com sucesso para ${rows.length} ${
      rows.length === 1 ? "corretor" : "corretores"
    }.`,
    ok: true,
  };
}
