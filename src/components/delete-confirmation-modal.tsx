import Link from "next/link";

import { secondaryButtonClassName } from "@/components/module-ui";
import { SubmitButton } from "@/components/submit-button";

export function DeleteConfirmationModal({
  action,
  cancelHref,
  description,
  fieldName,
  fieldValue,
  title,
}: {
  action: (formData: FormData) => Promise<void> | void;
  cancelHref: string;
  description: string;
  fieldName: string;
  fieldValue: string;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-secondary/25 p-0 backdrop-blur-[1px] sm:items-center sm:p-6">
      <section
        aria-labelledby="delete-confirmation-title"
        aria-modal="true"
        className="w-full rounded-t-3xl border border-border bg-background p-5 shadow-[0_24px_70px_rgba(37,41,54,0.18)] sm:max-w-md sm:rounded-3xl sm:p-6"
        role="dialog"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-600">
          Exclusão permanente
        </p>
        <h2
          className="mt-2 text-xl font-semibold text-brand-secondary"
          id="delete-confirmation-title"
        >
          {title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {description}
        </p>

        <form action={action} className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <input name={fieldName} type="hidden" value={fieldValue} />
          <input name="confirmacao" type="hidden" value="excluir" />
          <Link className={secondaryButtonClassName} href={cancelHref}>
            Cancelar
          </Link>
          <SubmitButton
            label="Excluir permanentemente"
            pendingLabel="Excluindo..."
            variant="danger"
          />
        </form>
      </section>
    </div>
  );
}
