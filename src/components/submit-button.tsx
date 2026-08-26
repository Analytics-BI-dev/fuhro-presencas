"use client";

import { useFormStatus } from "react-dom";

import {
  primaryButtonClassName,
  secondaryButtonClassName,
} from "@/components/module-ui";

export function SubmitButton({
  label,
  pendingLabel = "Salvando...",
  variant = "primary",
}: {
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-disabled={pending}
      className={
        variant === "secondary"
          ? secondaryButtonClassName
          : primaryButtonClassName
      }
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
