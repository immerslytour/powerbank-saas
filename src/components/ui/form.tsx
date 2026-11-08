"use client";
import * as React from "react";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "./button";
import { Alert } from "./misc";
import type { ActionState } from "@/lib/action-result";

export function SubmitButton({ children, pendingText, ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending && <Loader2 className="animate-spin" />}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Progressive-enhancement form bound to a server action, with inline status. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  onSuccess,
  showSuccess = true,
}: {
  action: FormAction;
  children: React.ReactNode | ((state: ActionState) => React.ReactNode);
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (state: ActionState) => void;
  showSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {typeof children === "function" ? children(state) : children}
      {state && !state.ok && (
        <Alert tone="danger" className="mt-4">
          {state.error}
        </Alert>
      )}
      {state?.ok && showSuccess && state.message && (
        <Alert tone="success" className="mt-4">
          {state.message}
        </Alert>
      )}
    </form>
  );
}

export function fieldError(state: ActionState, name: string) {
  return state && !state.ok ? state.fieldErrors?.[name] : undefined;
}
