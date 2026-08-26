"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthorization } from "@/lib/access";
import { syncEquipesSheet } from "@/lib/google-sheets/sync";

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
