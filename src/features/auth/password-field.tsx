"use client";
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff, Lock, Check, X } from "lucide-react";
import { clsx } from "clsx";
import { Field } from "@/components/ui/form";
import { PASSWORD_RULES } from "@/lib/repositories";

/** Password input with a visible label and a show/hide toggle. Value is never persisted. */
export const PasswordField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string; helper?: ReactNode; id: string; labelAction?: ReactNode }>(
  function PasswordField({ label, error, helper, id, required, labelAction, ...rest }, ref) {
    const [show, setShow] = useState(false);
    return (
      <Field label={label} htmlFor={id} required={required} error={error} helper={helper} labelAction={labelAction}>
        <div className="input-icon relative">
          <Lock className="size-4" aria-hidden />
          <input ref={ref} id={id} type={show ? "text" : "password"} className="input !pr-11" autoComplete="off" aria-invalid={!!error || undefined}
            aria-describedby={error ? `${id}-error` : helper ? `${id}-help` : undefined} required={required} {...rest} />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted hover:bg-neutral-bg hover:text-ink"
            aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={show} aria-controls={id}>
            {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
      </Field>
    );
  },
);

/** Live checklist of password rules (text + icon, never colour only). */
export function PasswordRules({ value }: { value: string }) {
  return (
    <ul className="grid gap-1.5 text-[13px] sm:grid-cols-2" aria-label="Yêu cầu mật khẩu">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(value);
        return (
          <li key={r.key} className={clsx("flex items-center gap-2", ok ? "text-success-text" : "text-muted")}>
            {ok ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
            {r.label}<span className="sr-only">{ok ? " — đạt" : " — chưa đạt"}</span>
          </li>
        );
      })}
    </ul>
  );
}
