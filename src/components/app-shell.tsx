import Link from "next/link";
import type { ReactNode } from "react";

import { logout } from "@/app/dashboard/actions";
import { Brand } from "@/components/brand";

type AppShellProps = {
  children: ReactNode;
  currentPath: string;
  pageTitle: string;
  profile: {
    name: string | null;
    role: string;
  };
};

const navigation = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/reunioes", label: "Reuniões" },
  { href: "/corretores", label: "Corretores" },
  { href: "/equipes", label: "Equipes" },
  { href: "/usuarios", label: "Usuários" },
];

function Navigation({ currentPath }: { currentPath: string }) {
  return (
    <nav aria-label="Navegação principal" className="space-y-1">
      {navigation.map((item) => {
        const isActive =
          currentPath === item.href || currentPath.startsWith(`${item.href}/`);

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`relative flex min-h-11 items-center gap-3 overflow-hidden rounded-xl px-4 text-sm font-semibold transition ${
              isActive
                ? "bg-brand-primary-soft text-brand-primary"
                : "text-muted-foreground hover:bg-surface hover:text-brand-secondary"
            }`}
            href={item.href}
            key={item.href}
          >
            {isActive ? (
              <span
                aria-hidden="true"
                className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-brand-primary"
              />
            ) : null}
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${
                isActive
                  ? "bg-brand-primary"
                  : "border border-border bg-background"
              }`}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function AppShell({
  children,
  currentPath,
  pageTitle,
  profile,
}: AppShellProps) {
  const displayName = profile.name ?? "Usuário";
  const initial = displayName.charAt(0).toLocaleUpperCase("pt-BR");

  return (
    <div className="min-h-screen bg-surface text-foreground lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="hidden min-h-screen flex-col border-r border-border bg-background p-5 lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div className="px-2 py-2">
          <Brand size="compact" />
        </div>

        <div className="mt-10">
          <p className="mb-3 px-4 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Menu
          </p>
          <Navigation currentPath={currentPath} />
        </div>

        <div className="mt-auto rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary-soft text-sm font-bold text-brand-primary">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-brand-secondary">
                {displayName}
              </p>
              <p className="mt-0.5 truncate text-xs capitalize text-muted-foreground">
                {profile.role}
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-border bg-background px-4 sm:px-6 lg:min-h-20 lg:px-8">
          <div className="flex items-center gap-3">
            <details className="group relative lg:hidden">
              <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border border-border text-brand-secondary transition hover:bg-surface [&::-webkit-details-marker]:hidden">
                <span className="sr-only">Abrir menu</span>
                <MenuIcon />
              </summary>
              <div className="absolute left-0 top-12 z-50 w-64 rounded-2xl border border-border bg-background p-4 shadow-[0_12px_36px_rgba(37,41,54,0.10)]">
                <div className="mb-5 border-b border-border pb-4">
                  <Brand size="compact" />
                </div>
                <Navigation currentPath={currentPath} />
              </div>
            </details>

            <div>
              <p className="hidden text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:block">
                Fuhro Presenças
              </p>
              <h1 className="text-lg font-semibold tracking-tight text-brand-secondary sm:mt-1 sm:text-xl">
                {pageTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-brand-secondary">
                {displayName}
              </p>
              <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                {profile.role}
              </p>
            </div>
            <form action={logout}>
              <button
                className="min-h-10 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-brand-secondary transition hover:border-brand-primary/30 hover:bg-brand-primary-soft hover:text-brand-primary"
                type="submit"
              >
                Sair
              </button>
            </form>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
