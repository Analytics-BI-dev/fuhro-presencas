import "server-only";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type SystemRole = "admin" | "operador" | "visualizador";

type DatabaseRecord = Record<string, unknown>;

type AccessError = {
  code?: string | null;
  message?: string | null;
};

export type AuthorizationProfile = {
  active: true;
  id: string;
  name: string | null;
  role: SystemRole;
};

export type AccessPermissions = {
  canCreate: boolean;
  canEdit: boolean;
  canToggleStatus: boolean;
};

function denyAccess(
  reason: "perfil-inativo" | "perfil-inexistente" | "role-invalida",
): never {
  redirect(`/acesso-negado?motivo=${reason}`);
}

function logAccessError(stage: string, error: AccessError) {
  const code = error.code?.trim() || "UNKNOWN";
  const message =
    error.message?.replace(/\s+/g, " ").trim().slice(0, 500) ||
    "Erro sem mensagem";

  console.error(`[ACCESS] ${stage}: code=${code} message=${message}`);
}

function failAccessQuery(stage: string, error: AccessError): never {
  logAccessError(stage, error);
  throw new Error("Não foi possível validar a autorização do usuário.");
}

function readString(record: DatabaseRecord, key: string) {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isSystemRole(value: unknown): value is SystemRole {
  return (
    value === "admin" || value === "operador" || value === "visualizador"
  );
}

export function getPermissions(role: SystemRole): AccessPermissions {
  const canEdit = role === "admin" || role === "operador";

  return {
    canCreate: canEdit,
    canEdit,
    canToggleStatus: role === "admin",
  };
}

async function resolveAgencyName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agencyId: string,
) {
  const { data, error } = await supabase
    .from("imobiliarias")
    .select("nome")
    .eq("id", agencyId)
    .limit(1);
  const agency = ((data ?? []) as DatabaseRecord[])[0];

  if (error) {
    logAccessError("Falha ao buscar imobiliarias", error);
    return "Imobiliária";
  }

  if (!agency) {
    return "Imobiliária";
  }

  return readString(agency, "nome") ?? "Imobiliária";
}

export async function requireAuthorization() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user: User | null = userData.user;

  if (userError || !user) {
    if (userError) {
      logAccessError("Falha ao obter usuário autenticado", userError);
    }
    redirect("/login");
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id,nome,role,ativo")
    .eq("id", user.id)
    .limit(2);
  const profileRows = (profileData ?? []) as DatabaseRecord[];

  if (profileError) {
    failAccessQuery("Falha ao buscar profiles", profileError);
  }

  if (profileRows.length === 0) {
    denyAccess("perfil-inexistente");
  }

  if (profileRows.length > 1) {
    failAccessQuery("Retorno inesperado ao buscar profiles", {
      code: "UNEXPECTED_RESULT",
      message: "A consulta retornou mais de um profile para o mesmo user.id.",
    });
  }

  const profileRecord = profileRows[0];

  if (profileRecord.ativo !== true) {
    denyAccess("perfil-inativo");
  }

  if (!isSystemRole(profileRecord.role)) {
    denyAccess("role-invalida");
  }

  const role = profileRecord.role;
  const { data: membershipData, error: membershipError } = await supabase
    .from("usuarios_imobiliarias")
    .select("imobiliaria_id")
    .eq("user_id", user.id)
    .limit(1);
  const membership = ((membershipData ?? []) as DatabaseRecord[])[0];

  if (membershipError) {
    failAccessQuery(
      "Falha ao buscar usuarios_imobiliarias",
      membershipError,
    );
  }

  const agencyId = membership
    ? readString(membership, "imobiliaria_id")
    : null;

  if (!agencyId) {
    redirect("/acesso-negado?motivo=sem-imobiliaria");
  }

  const profile: AuthorizationProfile = {
    active: true,
    id: user.id,
    name: readString(profileRecord, "nome"),
    role,
  };
  const permissions = getPermissions(role);

  return {
    agency: {
      id: agencyId,
      name: await resolveAgencyName(supabase, agencyId),
    },
    canEdit: permissions.canEdit,
    imobiliaria_id: agencyId,
    permissions,
    profile,
    role,
    supabase,
    user,
  };
}
