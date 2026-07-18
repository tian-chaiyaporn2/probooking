import { th } from "../lib/strings";

/** Shared trust chips used in the hero and elsewhere. */
export function TrustLine({ className }: { className?: string }) {
  return (
    <p
      className={["trust-line", className].filter(Boolean).join(" ")}
      aria-label={th.home.trust.join(" · ")}
      data-testid="trust-line"
    >
      {th.home.trust.map((t, i) => (
        <span key={t}>
          {i > 0 && (
            <span className="trust-line__dot" aria-hidden>
              ·
            </span>
          )}
          {t}
        </span>
      ))}
    </p>
  );
}
