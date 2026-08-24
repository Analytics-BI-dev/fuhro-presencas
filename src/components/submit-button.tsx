"use client";

import { useFormStatus } from "react-dom";

import { primaryButtonClassName } from "@/components/module-ui";

export function SubmitButton({
  label,
  pendingLabel = "Salvando...",
}: {
  label: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-disabled={pending}
      className={primaryButtonClassName}
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
