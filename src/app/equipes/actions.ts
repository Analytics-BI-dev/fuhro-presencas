"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthorization } from "@/lib/access";
import { checkTeamDeletion } from "@/lib/deletion-guards";
import { syncEquipesSheet } from "@/lib/google-sheets/sync";

function deletionWasConfirmed(formData: FormData) {
  return formData.get("confirmacao") === "excluir";
}

function logDeletionError(stage: string, error: { code?: string } | null) {
  const code = error?.code?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  console.error(`[DELETE_TEAM] ${stage}: code=${code || "UNKNOWN"}`);
}

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

function readOptionalText(formData: FormData, field: string, maxLength: number) {
  const value = formData.get(field);

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue ? normalizedValue.slice(0, maxLength) : null;
}

export async function createTeam(formData: FormData) {
  const context = await requireAuthorization();

  if (!context.permissions.canCreate) {
    redirect("/equipes?erro=sem-permissao");
  }

  const name = readRequiredText(formData, "nome", 160);

  if (!name) {
    redirect("/equipes?acao=nova&erro=nome-obrigatorio");
  }

  const ksiId = readOptionalText(formData, "id_ksi", 100);
  const active = context.permissions.canToggleStatus
    ? formData.get("ativo") === "on"
    : true;
  const { error } = await context.supabase.from("equipes").insert({
    ativo: active,
    id_ksi: ksiId,
    imobiliaria_id: context.agency.id,
    nome: name,
  });

  if (error) {
    redirect("/equipes?acao=nova&erro=nao-foi-possivel-salvar");
  }

  revalidatePath("/equipes");
  revalidatePath("/corretores");
  const sheetsResult = await syncEquipesSheet(
    context.supabase,
    context.imobiliaria_id,
  );
  redirect(
    `/equipes?sucesso=equipe-criada${sheetsResult.ok ? "" : "&aviso=google-sheets"}`,
  );
}

export async function updateTeam(formData: FormData) {
  const context = await requireAuthorization();

  if (!context.permissions.canEdit) {
    redirect("/equipes?erro=sem-permissao");
  }

  const teamId = readRequiredText(formData, "equipe_id", 100);
  const name = readRequiredText(formData, "nome", 160);

  if (!teamId) {
    redirect("/equipes?erro=equipe-invalida");
  }

  if (!name) {
    redirect(`/equipes?editar=${encodeURIComponent(teamId)}&erro=nome-obrigatorio`);
  }

  const { data: existingTeam, error: existingTeamError } =
    await context.supabase
      .from("equipes")
      .select("id")
      .eq("id", teamId)
      .eq("imobiliaria_id", context.agency.id)
      .maybeSingle();

  if (existingTeamError || !existingTeam) {
    redirect("/equipes?erro=equipe-invalida");
  }

  const changes: Record<string, unknown> = {
    id_ksi: readOptionalText(formData, "id_ksi", 100),
    nome: name,
  };

  if (context.permissions.canToggleStatus) {
    changes.ativo = formData.get("ativo") === "on";
  }

  const { error } = await context.supabase
    .from("equipes")
    .update(changes)
    .eq("id", teamId)
    .eq("imobiliaria_id", context.agency.id);

  if (error) {
    redirect(
      `/equipes?editar=${encodeURIComponent(teamId)}&erro=nao-foi-possivel-salvar`,
    );
  }

  revalidatePath("/equipes");
  revalidatePath("/corretores");
  const sheetsResult = await syncEquipesSheet(
    context.supabase,
    context.imobiliaria_id,
  );
  redirect(
    `/equipes?sucesso=equipe-atualizada${sheetsResult.ok ? "" : "&aviso=google-sheets"}`,
  );
}

export async function deleteTeam(formData: FormData) {
  const context = await requireAuthorization();

  if (!context.permissions.canDelete) {
    redirect("/equipes?erro=sem-permissao");
  }

  const teamId = readRequiredText(formData, "equipe_id", 100);

  if (!teamId || !deletionWasConfirmed(formData)) {
    redirect("/equipes?erro=equipe-invalida");
  }

  const { data: teamData, error: teamError } = await context.supabase
    .from("equipes")
    .select("id")
    .eq("id", teamId)
    .eq("imobiliaria_id", context.imobiliaria_id)
    .limit(2);

  if (teamError) {
    logDeletionError("Falha ao validar equipe", teamError);
    redirect("/equipes?erro=nao-foi-possivel-excluir");
  }

  if ((teamData ?? []).length !== 1) {
    redirect("/equipes?erro=equipe-invalida");
  }

  const deletionCheck = await checkTeamDeletion(context.supabase, teamId);

  if (!deletionCheck.ok) {
    logDeletionError("Falha ao validar histórico", deletionCheck.error);
    redirect("/equipes?erro=nao-foi-possivel-excluir");
  }

  if (deletionCheck.hasHistory) {
    redirect("/equipes?erro=equipe-possui-historico");
  }

  const { data: deletedTeamData, error: deleteTeamError } =
    await context.supabase
      .from("equipes")
      .delete()
      .eq("id", teamId)
      .eq("imobiliaria_id", context.imobiliaria_id)
      .select("id");

  if (deleteTeamError || (deletedTeamData ?? []).length !== 1) {
    logDeletionError("Falha ao excluir equipe", deleteTeamError);
    redirect("/equipes?erro=nao-foi-possivel-excluir");
  }

  revalidatePath("/equipes");
  revalidatePath("/corretores");
  const sheetsResult = await syncEquipesSheet(
    context.supabase,
    context.imobiliaria_id,
  );
  redirect(
    `/equipes?sucesso=equipe-excluida${sheetsResult.ok ? "" : "&aviso=google-sheets-exclusao"}`,
  );
}
