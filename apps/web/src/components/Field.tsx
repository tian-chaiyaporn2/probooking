import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

/** Label + control + optional error, matching StaffLogin field markup. */
export function Field({
  label,
  htmlFor,
  error,
  errorId,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  error?: ReactNode;
  errorId?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={errorId} role="alert" className="form-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  otp?: boolean;
};

/** Text input with clinical-trust styles; `otp` enables the spaced mono style. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { otp, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={["input", otp ? "input--otp" : "", className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
});
