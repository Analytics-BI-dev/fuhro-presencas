import type { ReactNode } from "react";

export const inputClassName =
  "min-h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-brand-secondary outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-primary/50 focus:ring-3 focus:ring-brand-primary/10";

export const primaryButtonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-primary px-4 text-sm font-semibold text-white transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryButtonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-semibold text-brand-secondary transition hover:border-brand-primary/30 hover:bg-brand-primary-soft hover:text-brand-primary";

export const destructiveButtonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60";

export function StatusBadge({
  active,
  activeLabel = "Ativo",
  inactiveLabel = "Inativo",
}: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        active
          ? "bg-emerald-50 text-emerald-700"
          : "bg-surface-muted text-muted-foreground"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${
          active ? "bg-emerald-500" : "bg-muted-foreground/60"
        }`}
      />
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

export function FlashMessage({
  message,
  type,
}: {
  message: string;
  type: "error" | "success" | "warning";
}) {
  const colorClassName =
    type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : type === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-red-200 bg-red-50 text-red-700";

  return (
    <div
      aria-live="polite"
      className={`mt-5 rounded-xl border px-4 py-3 text-sm ${colorClassName}`}
      role={type === "error" ? "alert" : "status"}
    >
      {message}
    </div>
  );
}

export function EmptyState({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 rounded-full bg-brand-primary"
      />
      <p className="mt-4 text-sm font-semibold text-brand-secondary">{title}</p>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-brand-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}
