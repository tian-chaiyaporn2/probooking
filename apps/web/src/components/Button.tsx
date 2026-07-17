import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, ComponentProps } from "react";
import Link from "next/link";

export type ButtonVariant = "primary" | "ghost" | "subtle";
export type ButtonSize = "md" | "lg";

/** Shared class builder so Button and ButtonLink never drift. */
export function buttonClassName(opts: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean | undefined;
  className?: string | undefined;
} = {}): string {
  const { variant = "ghost", size = "md", busy, className } = opts;
  return ["btn", `btn--${variant}`, size === "lg" ? "btn--lg" : "", busy ? "btn--busy" : "", className]
    .filter(Boolean)
    .join(" ");
}

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}

/** The one button. Variants × sizes, a busy spinner, and consistent focus/hover. */
export function Button({
  variant = "ghost",
  size = "md",
  busy,
  icon,
  children,
  disabled,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={buttonClassName({ variant, size, busy, className })}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <span className="btn__spinner" aria-hidden /> : icon}
      <span>{children}</span>
    </button>
  );
}

type ButtonLinkProps = Omit<ComponentProps<typeof Link>, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  icon?: ReactNode;
  children: ReactNode;
};

/** Anchor/link that looks like Button — use for CTAs that navigate. */
export function ButtonLink({
  variant = "ghost",
  size = "md",
  className,
  icon,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={buttonClassName({ variant, size, className })} {...rest}>
      {icon}
      <span>{children}</span>
    </Link>
  );
}

/** Plain <a> styled as a button (in-page anchors like #how). */
export function ButtonAnchor({
  variant = "ghost",
  size = "md",
  className,
  icon,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <a className={buttonClassName({ variant, size, className })} {...rest}>
      {icon}
      <span>{children}</span>
    </a>
  );
}
