import Link from "next/link";
import { th } from "../lib/strings";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "/", label: th.nav.home },
  { href: "/ops", label: th.nav.ops },
  { href: "/finance", label: th.nav.finance },
  { href: "/flow", label: th.nav.flow },
] as const;

/** Shared app shell header: brand + section nav + theme toggle. */
export function AppHeader({ current }: { current?: string }) {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <Link className="brand" href="/">
          <span className="brand__mark" aria-hidden>
            P
          </span>
          {th.brand}
        </Link>
        <nav className="app-nav" aria-label="Primary">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={current === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
