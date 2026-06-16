import type {
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";

/**
 * Composable form fields. Build a field structurally:
 *
 *   <Field>
 *     <FieldLabel htmlFor="email">Email</FieldLabel>
 *     <Input id="email" type="email" />
 *     <FieldHint>We never share it.</FieldHint>
 *     <FieldError>Required</FieldError>
 *   </Field>
 */
export function Field({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

export function FieldLabel({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    />
  );
}

export function FieldHint({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-xs text-foreground-muted", className)} {...props} />
  );
}

export function FieldError({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      role="alert"
      className={cn("text-xs font-medium text-danger", className)}
      {...props}
    />
  );
}

const control =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm " +
  "text-foreground placeholder:text-foreground-muted outline-none " +
  "transition-colors focus-visible:ring-2 focus-visible:ring-ring " +
  "focus-visible:border-primary disabled:opacity-50 disabled:pointer-events-none";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(control, "min-h-20 resize-y", className)} {...props} />
  );
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, "h-10", className)} {...props} />;
}
