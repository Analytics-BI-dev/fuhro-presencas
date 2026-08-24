import { Brand } from "@/components/brand";

export function ModuleLoading() {
  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-border bg-background p-7 lg:block">
        <Brand size="compact" />
        <div className="mt-12 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              className="h-11 animate-pulse rounded-xl bg-surface"
              key={index}
            />
          ))}
        </div>
      </aside>
      <div>
        <div className="h-16 border-b border-border bg-background lg:h-20" />
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          <div className="h-4 w-28 animate-pulse rounded bg-brand-primary-soft" />
          <div className="mt-3 h-9 w-52 animate-pulse rounded-lg bg-surface-muted" />
          <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-surface-muted" />
          <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-background p-5">
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  className="h-12 animate-pulse rounded-xl bg-surface"
                  key={index}
                />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
