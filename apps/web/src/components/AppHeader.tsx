"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { th } from "../lib/strings";
import { ThemeToggle } from "./ThemeToggle";
import { MenuIcon, CloseIcon } from "./icons";

const LINKS = [
  { href: "/", label: th.nav.home },
  { href: "/ops", label: th.nav.ops },
  { href: "/finance", label: th.nav.finance },
  { href: "/flow", label: th.nav.flow },
] as const;

/**
 * Shared app shell header: brand + section nav + theme toggle.
 *
 * On narrow screens the nav used to wrap onto its own row and push the theme toggle below
 * the brand — a two-row header that looked broken. It now collapses into a drawer behind a
 * menu button, which is closed on Escape, on backdrop tap, and on navigation.
 */
export function AppHeader({ current }: { current?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    // Lock body scroll while the drawer is open.
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <Link className="brand" href="/" onClick={() => setOpen(false)}>
          <span className="brand__mark" aria-hidden>
            P
          </span>
          {th.brand}
        </Link>

        {/* Desktop nav */}
        <nav className="app-nav app-nav--desktop" aria-label={th.a11y.primaryNav}>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={current === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="app-header__right">
          <ThemeToggle />
          <button
            type="button"
            className="nav-toggle"
            aria-label={open ? th.a11y.closeMenu : th.a11y.openMenu}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <>
          <button className="nav-backdrop" aria-label={th.a11y.closeMenu} onClick={() => setOpen(false)} />
          <nav className="app-nav--drawer" aria-label={th.a11y.primaryNav}>
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={current === l.href ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <p className="app-nav--drawer__foot">{th.home.phase}</p>
          </nav>
        </>
      )}
    </header>
  );
}
