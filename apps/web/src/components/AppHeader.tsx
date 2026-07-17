"use client";

import { useEffect, useId, useRef, useState } from "react";
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

/** Keep in sync with `--nav-drawer-max` in globals.css (tablet keeps the drawer). */
const DRAWER_MQ = "(min-width: 960px)";

/**
 * Shared app shell header: brand + section nav + theme toggle.
 *
 * On phone and tablet the nav collapses into a drawer behind a menu button. The drawer
 * closes on Escape, backdrop tap, resize into the desktop band, and navigation; scroll
 * is locked on <html> while open; Tab cycles inside the panel.
 */
export function AppHeader({ current }: { current?: string }) {
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const drawer = drawerRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !drawer) return;
      const focusables = Array.from(
        drawer.querySelectorAll<HTMLElement>(
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
    // Lock scroll on <html> — locking body alone can shrink the fixed containing
    // block in WebKit/Blink and collapse the drawer to content height.
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.overflow = prevOverflow;
      toggleRef.current?.focus();
    };
  }, [open]);

  // If the viewport grows into the desktop nav band, dismiss the drawer so it
  // cannot linger as an invisible overlay after orientation change.
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
    // Safari < 14
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

      {/* Mobile / tablet drawer */}
      {open && (
        <>
          <button className="nav-backdrop" aria-label={th.a11y.closeMenu} onClick={() => setOpen(false)} />
          <nav
            ref={drawerRef}
            id={drawerId}
            className="app-nav--drawer"
            aria-label={th.a11y.primaryNav}
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
