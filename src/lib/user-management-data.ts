import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

type DatabaseRecord = Record<string, unknown>;

export type ManagedUser = {
  active: boolean;
  agencyName: string;
  createdAt: string;
  email: string;
  id: string;
  name: string;
  role: string;
};

export function logUserManagementError(
  stage: string,
  error: { code?: string | null; message?: string | null },
) {
  const code = error.code?.trim() || "UNKNOWN";
  const message =
    error.message?.replace(/\s+/g, " ").trim().slice(0, 500) ||
    "Erro sem mensagem";

  console.error(`[USERS] ${stage}: code=${code} message=${message}`);
}

function readText(record: DatabaseRecord, key: string) {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function listAllAuthUsers(adminClient: SupabaseClient) {
  const users: User[] = [];
  const perPage = 1_000;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      logUserManagementError("Falha ao listar usuários do Auth", error);
      throw new Error("Não foi possível carregar os usuários.");
    }

    users.push(...data.users);

    if (data.users.length < perPage) {
      break;
    }
  }

  return users;
}

export async function loadManagedUsers(
  sessionClient: SupabaseClient,
  adminClient: SupabaseClient,
  agencyId: string,
  agencyName: string,
) {
  const { data: membershipData, error: membershipError } = await sessionClient
    .from("usuarios_imobiliarias")
    .select("user_id,imobiliaria_id,created_at")
    .eq("imobiliaria_id", agencyId);

  if (membershipError) {
    logUserManagementError(
      "Falha ao buscar usuarios_imobiliarias",
      membershipError,
    );
    throw new Error("Não foi possível carregar os usuários.");
  }

  const memberships = (membershipData ?? []) as DatabaseRecord[];
  const userIds = [
    ...new Set(
      memberships
        .map((membership) => readText(membership, "user_id"))
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (userIds.length === 0) {
    return [] satisfies ManagedUser[];
  }

  const [{ data: profileData, error: profileError }, authUsers] =
    await Promise.all([
      sessionClient
        .from("profiles")
        .select("id,nome,role,ativo,created_at")
        .in("id", userIds),
      listAllAuthUsers(adminClient),
    ]);

  if (profileError) {
    logUserManagementError("Falha ao buscar profiles", profileError);
    throw new Error("Não foi possível carregar os usuários.");
  }

  const profiles = new Map(
    ((profileData ?? []) as DatabaseRecord[]).flatMap((profile) => {
      const id = readText(profile, "id");

      return id ? [[id, profile] as const] : [];
    }),
  );
  const authUsersById = new Map(authUsers.map((user) => [user.id, user]));

  return userIds.flatMap((userId): ManagedUser[] => {
    const profile = profiles.get(userId);
    const authUser = authUsersById.get(userId);

    if (!profile || !authUser) {
      return [];
    }

    return [
      {
        active: profile.ativo === true,
        agencyName,
        createdAt:
          readText(profile, "created_at") ?? authUser.created_at ?? "",
        email: authUser.email ?? "E-mail indisponível",
        id: userId,
        name: readText(profile, "nome") ?? "Nome não informado",
        role: readText(profile, "role") ?? "Não definido",
      },
    ];
  });
}
