"use client";

import { useFormStatus } from "react-dom";

import { toggleBrokerStatus } from "@/app/corretores/actions";

function ToggleButton({
  active,
  brokerName,
}: {
  active: boolean;
  brokerName: string;
}) {
  const { pending } = useFormStatus();
  const statusLabel = active ? "Ativo" : "Inativo";

  return (
    <button
      aria-checked={active}
      aria-label={`Alterar status de ${brokerName}. Status atual: ${statusLabel}.`}
      className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-60 ${
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100"
          : "border-border bg-surface-muted text-muted-foreground hover:border-brand-primary/30 hover:bg-brand-primary-soft hover:text-brand-primary"
      }`}
      disabled={pending}
      role="switch"
      title={`Clique para ${active ? "inativar" : "ativar"}`}
      type="submit"
    >
      <span
        aria-hidden="true"
        className={`inline-flex h-5 w-10 shrink-0 items-center overflow-hidden rounded-full p-0.5 transition-colors ${
          active ? "bg-emerald-500" : "bg-muted-foreground/35"
        }`}
      >
        <span
          className={`h-4 w-4 shrink-0 rounded-full bg-white shadow-sm transition-transform ${
            active ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
      <span>{pending ? "Alterando..." : statusLabel}</span>
    </button>
  );
}

export function BrokerStatusToggle({
  active,
  brokerId,
  brokerName,
}: {
  active: boolean;
  brokerId: string;
  brokerName: string;
}) {
  return (
    <form action={toggleBrokerStatus}>
      <input name="corretor_id" type="hidden" value={brokerId} />
      <input name="ativo" type="hidden" value={String(!active)} />
      <ToggleButton active={active} brokerName={brokerName} />
    </form>
  );
}
