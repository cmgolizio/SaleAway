"use client";

import { useActionState, type ReactNode } from "react";

export type ActionResult = { ok: boolean; message: string } | null;

// A form bound to a Server Action that shows the action's message and a pending state.
export function ActionForm({
  action,
  submitLabel,
  children,
  className,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      <button type="submit" disabled={pending}>
        {pending ? "Working…" : submitLabel}
      </button>
      {state && <span className={state.ok ? "ok" : "error"}>{state.message}</span>}
    </form>
  );
}
