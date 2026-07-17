import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "subtle";
type Size = "md" | "lg";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  "data-testid"?: string;
}

/** The one button. Variants × sizes, a busy spinner, and consistent focus/hover. */
export function Button({ variant = "ghost", size = "md", busy, icon, children, disabled, ...rest }: Props) {
  const cls = ["btn", `btn--${variant}`, size === "lg" ? "btn--lg" : "", busy ? "btn--busy" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <span className="btn__spinner" aria-hidden /> : icon}
      <span>{children}</span>
    </button>
  );
}
