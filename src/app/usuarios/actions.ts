"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminAuthorization } from "@/lib/access";
import { syncAllGoogleSheets } from "@/lib/google-sheets/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listAllAuthUsers,
  logUserManagementError,
} from "@/lib/user-management-data";

type DatabaseRecord = Record<string, unknown>;

function readText(formData: FormData, field: string) {
  const value = formData.get(field);

  return typeof value === "string" ? value.trim() : "";
}

function readPassword(formData: FormData, field: string) {
  const value = formData.get(field);

  return typeof value === "string" ? value : "";
}

function isValidEmail(email: string) {
  return (
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

function readId(record: DatabaseRecord) {
  const value = record.id;

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isDuplicateEmailError(error: { code?: string; message?: string }) {
  const diagnostic = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();

  return (
    diagnostic.includes("email_exists") ||
    diagnostic.includes("already") ||
    diagnostic.includes("registered")
  );
}

export async function createManagedUser(formData: FormData) {
  const context = await requireAdminAuthorization();
  const name = readText(formData, "nome");
  const email = readText(formData, "email").toLocaleLowerCase("pt-BR");
  const password = readPassword(formData, "senha");
  const passwordConfirmation = readPassword(formData, "confirmar_senha");

  if (!name || name.length > 180 || !isValidEmail(email)) {
    redirect("/usuarios?acao=novo&erro=campos-invalidos");
  }

  if (password.length < 8 || password.length > 4_096) {
    redirect("/usuarios?acao=novo&erro=senha-invalida");
  }

  if (password !== passwordConfirmation) {
    redirect("/usuarios?acao=novo&erro=senhas-diferentes");
  }

  const adminClient = createAdminClient();
  const authUsers = await listAllAuthUsers(adminClient);
  const alreadyExists = authUsers.some(
    (user) => user.email?.toLocaleLowerCase("pt-BR") === email,
  );

  if (alreadyExists) {
    redirect("/usuarios?acao=novo&erro=email-duplicado");
  }

  const { data: creationData, error: creationError } =
    await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
      user_metadata: { nome: name },
    });

  if (creationError || !creationData.user) {
    if (creationError) {
      logUserManagementError("Falha ao criar usuário no Auth", creationError);
    }

    if (creationError && isDuplicateEmailError(creationError)) {
      redirect("/usuarios?acao=novo&erro=email-duplicado");
    }

    redirect("/usuarios?acao=novo&erro=falha-criacao");
  }

  const createdUserId = creationData.user.id;
  const { error: profileError } = await context.supabase
    .from("profiles")
    .upsert(
      {
        ativo: true,
        id: createdUserId,
        nome: name,
        role: "operador",
      },
      { onConflict: "id" },
    );

  if (profileError) {
    logUserManagementError("Falha ao configurar profile do usuário", profileError);
    redirect("/usuarios?acao=novo&erro=falha-provisionamento");
  }

  const { error: membershipError } = await context.supabase
    .from("usuarios_imobiliarias")
    .upsert(
      {
        imobiliaria_id: context.imobiliaria_id,
        user_id: createdUserId,
      },
      {
        ignoreDuplicates: true,
        onConflict: "user_id,imobiliaria_id",
      },
    );

  if (membershipError) {
    logUserManagementError(
      "Falha ao criar vínculo do usuário",
      membershipError,
    );
    redirect("/usuarios?acao=novo&erro=falha-provisionamento");
  }

  revalidatePath("/usuarios");
  redirect("/usuarios?sucesso=usuario-criado");
}

export async function resetUserPassword(formData: FormData) {
  const context = await requireAdminAuthorization();
  const targetUserId = readText(formData, "user_id");
  const password = readPassword(formData, "senha");
  const passwordConfirmation = readPassword(formData, "confirmar_senha");

  if (!targetUserId || targetUserId.length > 100) {
    redirect("/usuarios?erro=usuario-invalido");
  }

  if (password.length < 8 || password.length > 4_096) {
    redirect(
      `/usuarios?redefinir=${encodeURIComponent(targetUserId)}&erro=senha-invalida`,
    );
  }

  if (password !== passwordConfirmation) {
    redirect(
      `/usuarios?redefinir=${encodeURIComponent(targetUserId)}&erro=senhas-diferentes`,
    );
  }

  const { data: membershipData, error: membershipError } =
    await context.supabase
      .from("usuarios_imobiliarias")
      .select("id")
      .eq("user_id", targetUserId)
      .eq("imobiliaria_id", context.imobiliaria_id)
      .limit(1);

  if (membershipError) {
    logUserManagementError(
      "Falha ao validar vínculo para redefinição de senha",
      membershipError,
    );
    redirect("/usuarios?erro=falha-senha");
  }

  if ((membershipData ?? []).length !== 1) {
    redirect("/usuarios?erro=usuario-invalido");
  }

  const adminClient = createAdminClient();
  const { error: passwordError } =
    await adminClient.auth.admin.updateUserById(targetUserId, { password });

  if (passwordError) {
    logUserManagementError(
      "Falha ao redefinir senha no Auth",
      passwordError,
    );
    redirect(
      `/usuarios?redefinir=${encodeURIComponent(targetUserId)}&erro=falha-senha`,
    );
  }

  revalidatePath("/usuarios");
  redirect("/usuarios?sucesso=senha-redefinida");
}

export async function updateUserStatus(formData: FormData) {
  const context = await requireAdminAuthorization();
  const targetUserId = readText(formData, "user_id");
  const targetActive = readText(formData, "ativo") === "true";

  if (!targetUserId || targetUserId.length > 100) {
    redirect("/usuarios?erro=usuario-invalido");
  }

  if (targetUserId === context.user.id && !targetActive) {
    redirect("/usuarios?erro=auto-inativacao");
  }

  const { data: membershipData, error: membershipError } =
    await context.supabase
      .from("usuarios_imobiliarias")
      .select("id")
      .eq("user_id", targetUserId)
      .eq("imobiliaria_id", context.imobiliaria_id)
      .limit(1);

  if (membershipError) {
    logUserManagementError(
      "Falha ao validar vínculo para alteração de status",
      membershipError,
    );
    redirect("/usuarios?erro=falha-status");
  }

  if ((membershipData ?? []).length !== 1) {
    redirect("/usuarios?erro=usuario-invalido");
  }

  const { data: profileData, error: profileError } = await context.supabase
    .from("profiles")
    .update({ ativo: targetActive })
    .eq("id", targetUserId)
    .select("id")
    .limit(1);

  if (profileError) {
    logUserManagementError("Falha ao alterar status do profile", profileError);
    redirect("/usuarios?erro=falha-status");
  }

  const updatedProfile = ((profileData ?? []) as DatabaseRecord[])[0];

  if (!updatedProfile || !readId(updatedProfile)) {
    redirect("/usuarios?erro=usuario-invalido");
  }

  revalidatePath("/usuarios");
  redirect(
    `/usuarios?sucesso=${targetActive ? "usuario-reativado" : "usuario-inativado"}`,
  );
}

export async function syncGoogleSheetsManually() {
  const context = await requireAdminAuthorization();
  const result = await syncAllGoogleSheets(
    context.supabase,
    context.imobiliaria_id,
  );

  revalidatePath("/usuarios");

  if (!result.ok) {
    redirect("/usuarios?erro=google-sheets-sync");
  }

  redirect("/usuarios?sucesso=google-sheets-sync");
}
