"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { th } from "../lib/strings";
import { getSessionContext, type SessionRole } from "../lib/session-role";
import { clearSession } from "../lib/demo-accounts";
import { ThemeToggle } from "./ThemeToggle";
import { MenuIcon, CloseIcon } from "./icons";

const DRAWER_MQ = "(min-width: 960px)";

function navForRole(role: SessionRole | null) {
  if (!role || role === "unknown") {
    return [
      { href: "/", label: th.nav.home },
      { href: "/signin", label: th.nav.signin },
    ] as const;
  }
  if (role === "clinic") {
    return [
      { href: "/", label: th.nav.home },
      { href: "/clinic", label: th.nav.clinic },
      { href: "/signin", label: th.nav.switchRole },
    ] as const;
  }
  if (role === "professional") {
    return [
      { href: "/", label: th.nav.home },
      { href: "/pro", label: th.nav.pro },
      { href: "/signin", label: th.nav.switchRole },
    ] as const;
  }
  if (role === "operations") {
    return [
      { href: "/", label: th.nav.home },
      { href: "/ops", label: th.nav.ops },
      { href: "/signin", label: th.nav.switchRole },
    ] as const;
  }
  return [
    { href: "/", label: th.nav.home },
    { href: "/finance", label: th.nav.finance },
    { href: "/signin", label: th.nav.switchRole },
  ] as const;
}

export function AppHeader({ current }: { current?: string }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<ReturnType<typeof getSessionContext>>(null);
  const drawerId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setSession(getSessionContext());
  }, [current]);

  const links = navForRole(session?.role ?? null);

  useEffect(() => {
    if (!open) return;
    const main = document.getElementById("main");
    if (main) main.inert = true;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !drawerRef.current) return;
      const focusables = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.overflow = prevOverflow;
      if (main) main.inert = false;
      toggleRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    const mq = window.matchMedia(DRAWER_MQ);
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    onChange();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <Link className="brand" href="/" onClick={() => setOpen(false)}>
          <span className="brand__mark" aria-hidden>
            P
          </span>
          {th.brand}
        </Link>

        {session && (
          <span className="role-chip" data-testid="role-chip">
            {session.label}
          </span>
        )}

        <nav className="app-nav app-nav--desktop" aria-label={th.a11y.primaryNav}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} aria-current={current === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
          {session && (
            <button
              type="button"
              className="nav-signout"
              onClick={() => {
                clearSession();
                setSession(null);
                window.location.href = "/";
              }}
            >
              {th.nav.signOut}
            </button>
          )}
        </nav>

        <div className="app-header__right">
          <ThemeToggle />
          <button
            ref={toggleRef}
            type="button"
            className="nav-toggle"
            aria-label={open ? th.a11y.closeMenu : th.a11y.openMenu}
            aria-expanded={open}
            aria-controls={drawerId}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {open && (
        <>
          <button className="nav-backdrop" aria-label={th.a11y.closeMenu} onClick={() => setOpen(false)} />
          <nav
            ref={drawerRef}
            id={drawerId}
            className="app-nav--drawer"
            aria-label={th.a11y.primaryNav}
            role="dialog"
            aria-modal="true"
          >
            <div className="app-nav--drawer__top">
              <span className="app-nav--drawer__title">{th.a11y.primaryNav}</span>
              <button
                ref={closeRef}
                type="button"
                className="nav-drawer-close"
                aria-label={th.a11y.closeMenu}
                onClick={() => setOpen(false)}
              >
                <CloseIcon />
              </button>
            </div>
            {session && <p className="app-nav--drawer__role">{session.label}</p>}
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={current === l.href ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            {session && (
              <button
                type="button"
                className="nav-signout nav-signout--drawer"
                onClick={() => {
                  clearSession();
                  setOpen(false);
                  window.location.href = "/";
                }}
              >
                {th.nav.signOut}
              </button>
            )}
            <p className="app-nav--drawer__foot">{th.home.region}</p>
          </nav>
        </>
      )}
    </header>
  );
}
