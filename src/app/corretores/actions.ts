"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthorization } from "@/lib/access";

type DatabaseRecord = Record<string, unknown>;

function readRequiredText(formData: FormData, field: string, maxLength: number) {
  const value = formData.get(field);

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue && normalizedValue.length <= maxLength
    ? normalizedValue
    : null;
}

function readOptionalId(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue && normalizedValue !== "sem-equipe"
    ? normalizedValue.slice(0, 100)
    : null;
}

function readId(record: DatabaseRecord, field = "id") {
  const value = record[field];

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

async function validateTeam(
  context: Awaited<ReturnType<typeof requireAuthorization>>,
  teamId: string | null,
) {
  if (!teamId) {
    return true;
  }

  const { data, error } = await context.supabase
    .from("equipes")
    .select("id")
    .eq("id", teamId)
    .eq("imobiliaria_id", context.agency.id)
    .maybeSingle();

  return !error && Boolean(data);
}

async function getCurrentLinks(
  context: Awaited<ReturnType<typeof requireAuthorization>>,
  brokerId: string,
) {
  const { data, error } = await context.supabase
    .from("corretor_equipes")
    .select("*")
    .eq("corretor_id", brokerId)
    .is("data_fim", null);

  return {
    error,
    links: (data ?? []) as DatabaseRecord[],
  };
}

async function createCurrentLink(
  context: Awaited<ReturnType<typeof requireAuthorization>>,
  brokerId: string,
  teamId: string,
) {
  const beforeInsert = await getCurrentLinks(context, brokerId);

  if (beforeInsert.error || beforeInsert.links.length > 0) {
    return { ok: false as const, linkId: null };
  }

  const { data, error } = await context.supabase
    .from("corretor_equipes")
    .insert({
      corretor_id: brokerId,
      data_fim: null,
      data_inicio: todayInSaoPaulo(),
      equipe_id: teamId,
    })
    .select("id")
    .single();
  const linkId = data ? readId(data as DatabaseRecord) : null;

  if (error || !linkId) {
    return { ok: false as const, linkId: null };
  }

  const afterInsert = await getCurrentLinks(context, brokerId);

  if (afterInsert.error || afterInsert.links.length !== 1) {
    await context.supabase
      .from("corretor_equipes")
      .delete()
      .eq("id", linkId);
    return { ok: false as const, linkId: null };
  }

  return { ok: true as const, linkId };
}

async function changeCurrentTeam(
  context: Awaited<ReturnType<typeof requireAuthorization>>,
  brokerId: string,
  newTeamId: string | null,
) {
  const currentResult = await getCurrentLinks(context, brokerId);

  if (currentResult.error || currentResult.links.length > 1) {
    return false;
  }

  const currentLink = currentResult.links[0] ?? null;
  const currentLinkId = currentLink ? readId(currentLink) : null;
  const currentTeamId = currentLink ? readId(currentLink, "equipe_id") : null;

  if (currentTeamId === newTeamId) {
    return true;
  }

  if (currentLink && (!currentLinkId || !currentTeamId)) {
    return false;
  }

  const today = todayInSaoPaulo();

  if (currentLinkId) {
    const { error: closeError } = await context.supabase
      .from("corretor_equipes")
      .update({ data_fim: today })
      .eq("id", currentLinkId)
      .eq("corretor_id", brokerId)
      .is("data_fim", null);

    if (closeError) {
      return false;
    }
  }

  const afterClose = await getCurrentLinks(context, brokerId);

  if (afterClose.error || afterClose.links.length > 0) {
    if (currentLinkId) {
      await context.supabase
        .from("corretor_equipes")
        .update({ data_fim: null })
        .eq("id", currentLinkId)
        .eq("data_fim", today);
    }
    return false;
  }

  if (!newTeamId) {
    return true;
  }

  const newLink = await createCurrentLink(context, brokerId, newTeamId);

  if (!newLink.ok && currentLinkId) {
    await context.supabase
      .from("corretor_equipes")
      .update({ data_fim: null })
      .eq("id", currentLinkId)
      .eq("data_fim", today);
  }

  return newLink.ok;
}

export async function createBroker(formData: FormData) {
  const context = await requireAuthorization();

  if (!context.permissions.canCreate) {
    redirect("/corretores?erro=sem-permissao");
  }

  const name = readRequiredText(formData, "nome", 180);
  const ksiId = readRequiredText(formData, "id_ksi", 100);

  if (!name) {
    redirect("/corretores?acao=novo&erro=nome-obrigatorio");
  }

  if (!ksiId) {
    redirect("/corretores?acao=novo&erro=id-ksi-obrigatorio");
  }

  const teamId = readOptionalId(formData, "equipe_id");

  if (!(await validateTeam(context, teamId))) {
    redirect("/corretores?acao=novo&erro=equipe-invalida");
  }

  const { data, error } = await context.supabase
    .from("corretores")
    .insert({
      ativo: context.permissions.canToggleStatus
        ? formData.get("ativo") === "on"
        : true,
      id_ksi: ksiId,
      imobiliaria_id: context.agency.id,
      nome: name,
    })
    .select("id")
    .single();
  const brokerId = data ? readId(data as DatabaseRecord) : null;

  if (error || !brokerId) {
    redirect("/corretores?acao=novo&erro=nao-foi-possivel-salvar");
  }

  if (teamId) {
    const linkResult = await createCurrentLink(context, brokerId, teamId);

    if (!linkResult.ok) {
      await context.supabase
        .from("corretores")
        .delete()
        .eq("id", brokerId)
        .eq("imobiliaria_id", context.agency.id);
      redirect("/corretores?acao=novo&erro=nao-foi-possivel-vincular");
    }
  }

  revalidatePath("/corretores");
  revalidatePath("/equipes");
  redirect("/corretores?sucesso=corretor-criado");
}

export async function updateBroker(formData: FormData) {
  const context = await requireAuthorization();

  if (!context.permissions.canEdit) {
    redirect("/corretores?erro=sem-permissao");
  }

  const brokerId = readRequiredText(formData, "corretor_id", 100);
  const name = readRequiredText(formData, "nome", 180);
  const ksiId = readRequiredText(formData, "id_ksi", 100);

  if (!brokerId) {
    redirect("/corretores?erro=corretor-invalido");
  }

  if (!name) {
    redirect(
      `/corretores?editar=${encodeURIComponent(brokerId)}&erro=nome-obrigatorio`,
    );
  }

  if (!ksiId) {
    redirect(
      `/corretores?editar=${encodeURIComponent(brokerId)}&erro=id-ksi-obrigatorio`,
    );
  }

  const { data: existingBroker, error: existingBrokerError } =
    await context.supabase
      .from("corretores")
      .select("id")
      .eq("id", brokerId)
      .eq("imobiliaria_id", context.agency.id)
      .maybeSingle();

  if (existingBrokerError || !existingBroker) {
    redirect("/corretores?erro=corretor-invalido");
  }

  const teamId = readOptionalId(formData, "equipe_id");

  if (!(await validateTeam(context, teamId))) {
    redirect(
      `/corretores?editar=${encodeURIComponent(brokerId)}&erro=equipe-invalida`,
    );
  }

  const changes: Record<string, unknown> = {
    id_ksi: ksiId,
    nome: name,
  };

  if (context.permissions.canToggleStatus) {
    changes.ativo = formData.get("ativo") === "on";
  }

  const { error: updateError } = await context.supabase
    .from("corretores")
    .update(changes)
    .eq("id", brokerId)
    .eq("imobiliaria_id", context.agency.id);

  if (updateError) {
    redirect(
      `/corretores?editar=${encodeURIComponent(brokerId)}&erro=nao-foi-possivel-salvar`,
    );
  }

  if (!(await changeCurrentTeam(context, brokerId, teamId))) {
    redirect(
      `/corretores?editar=${encodeURIComponent(brokerId)}&erro=nao-foi-possivel-vincular`,
    );
  }

  revalidatePath("/corretores");
  revalidatePath("/equipes");
  redirect("/corretores?sucesso=corretor-atualizado");
}

export async function toggleBrokerStatus(formData: FormData) {
  const context = await requireAuthorization();

  if (!context.permissions.canToggleStatus) {
    redirect("/corretores?erro=sem-permissao");
  }

  const brokerId = readRequiredText(formData, "corretor_id", 100);
  const activeValue = formData.get("ativo");

  if (
    !brokerId ||
    (activeValue !== "true" && activeValue !== "false")
  ) {
    redirect("/corretores?erro=corretor-invalido");
  }

  const active = activeValue === "true";
  const { data, error } = await context.supabase
    .from("corretores")
    .update({ ativo: active })
    .eq("id", brokerId)
    .eq("imobiliaria_id", context.agency.id)
    .select("id");

  if (error || (data ?? []).length !== 1) {
    redirect("/corretores?erro=nao-foi-possivel-alterar-status");
  }

  revalidatePath("/corretores");
  revalidatePath("/reunioes");
  revalidatePath("/historico");
  redirect(
    `/corretores?sucesso=${active ? "corretor-ativado" : "corretor-inativado"}`,
  );
}
