import { AppShell } from "@/components/app-shell";
import { requireAuthorization } from "@/lib/access";

export async function ComingSoonPage({
  currentPath,
  description,
  title,
}: {
  currentPath: string;
  description: string;
  title: string;
}) {
  const { profile } = await requireAuthorization();

  return (
    <AppShell currentPath={currentPath} pageTitle={title} profile={profile}>
      <section>
        <p className="text-sm font-semibold text-brand-primary">Em breve</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-secondary sm:text-3xl">
          {title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </section>
      <div className="mt-8 flex min-h-64 flex-col items-center justify-center rounded-2xl border border-border bg-background px-6 py-12 text-center">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full bg-brand-primary"
        />
        <p className="mt-4 text-sm font-semibold text-brand-secondary">
          Módulo ainda não implementado
        </p>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          A navegação já está preparada, sem antecipar funcionalidades desta
          etapa.
        </p>
      </div>
    </AppShell>
  );
}
