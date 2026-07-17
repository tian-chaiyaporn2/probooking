"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { th } from "../lib/strings";
import { CloseMenuIcon, MenuIcon } from "./icons";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "/", label: th.nav.home },
  { href: "/ops", label: th.nav.ops },
  { href: "/finance", label: th.nav.finance },
  { href: "/flow", label: th.nav.flow },
] as const;

/** Shared app shell header: brand + collapsible nav on small screens + theme toggle. */
export function AppHeader({ current }: { current?: string }) {
  const pathname = usePathname();
  const active = current ?? pathname;
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the drawer after navigation or when resizing to desktop.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches) setMenuOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <Link className="brand" href="/">
          <span className="brand__mark" aria-hidden>
            P
          </span>
          {th.brand}
        </Link>

        <nav
          id="primary-nav"
          className={`app-nav${menuOpen ? " app-nav--open" : ""}`}
          aria-label="Primary"
        >
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active === l.href ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="app-header__tools">
          <button
            type="button"
            className="btn btn--ghost btn--icon app-nav-toggle"
            aria-expanded={menuOpen}
            aria-controls="primary-nav"
            aria-label={menuOpen ? th.nav.closeMenu : th.nav.openMenu}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <CloseMenuIcon /> : <MenuIcon />}
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
