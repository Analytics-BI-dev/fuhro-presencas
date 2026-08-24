import { checkSupabaseConnection } from "@/lib/supabase/server";

export default async function Home() {
  const isSupabaseConnected = await checkSupabaseConnection();

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">
          Fuhro Presenças
        </h1>
        <p className="mt-4 text-lg text-zinc-600">
          Sistema de gestão de presença em reuniões
        </p>
        <p className="mt-2 text-sm text-zinc-500">Ambiente configurado.</p>
        <p className="mt-1 text-sm text-zinc-500">
          Comunicação com o Supabase:{" "}
          {isSupabaseConnected ? "confirmada" : "indisponível"}.
        </p>
      </section>
    </main>
  );
}
