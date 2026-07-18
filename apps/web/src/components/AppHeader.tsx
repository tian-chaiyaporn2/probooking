"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { th } from "../lib/strings";
import { ThemeToggle } from "./ThemeToggle";
import { MenuIcon, CloseIcon } from "./icons";

type NavLink = { href: string; label: string; group?: "public" | "staff" };

const LINKS: NavLink[] = [
  { href: "/", label: th.nav.home, group: "public" },
  { href: "/journey", label: th.nav.journey, group: "public" },
  { href: "/ops", label: th.nav.ops, group: "staff" },
  { href: "/finance", label: th.nav.finance, group: "staff" },
  { href: "/flow", label: th.nav.flow, group: "public" },
];

/** Keep in sync with max-width: 959px drawer breakpoint in pages.css. */
const DRAWER_MQ = "(min-width: 960px)";

/**
 * Shared app shell header: brand + section nav + theme toggle.
 *
 * Nav separates public journey surfaces from staff tools (UX F7) while keeping
 * the developer demo link for e2e. On phone/tablet the nav collapses into a drawer.
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
    const main = document.getElementById("main");
    if (main) main.inert = true;
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

  const publicLinks = LINKS.filter((l) => l.group === "public");
  const staffLinks = LINKS.filter((l) => l.group === "staff");

  function renderLinks(links: NavLink[], onNavigate?: () => void) {
    return links.map((l) => (
      <Link
        key={l.href}
        href={l.href}
        aria-current={current === l.href ? "page" : undefined}
        {...(onNavigate ? { onClick: onNavigate } : {})}
      >
        {l.label}
      </Link>
    ));
  }

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <Link className="brand" href="/" onClick={() => setOpen(false)}>
          <span className="brand__mark" aria-hidden>
            P
          </span>
          {th.brand}
        </Link>

        <nav className="app-nav app-nav--desktop" aria-label={th.a11y.primaryNav}>
          {renderLinks(publicLinks)}
          <span className="app-nav__divider" aria-hidden />
          <span className="app-nav__group-label">{th.nav.staffGroup}</span>
          {renderLinks(staffLinks)}
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
            <p className="app-nav--drawer__group">{th.nav.publicGroup}</p>
            {renderLinks(publicLinks, () => setOpen(false))}
            <p className="app-nav--drawer__group">{th.nav.staffGroup}</p>
            {renderLinks(staffLinks, () => setOpen(false))}
            <p className="app-nav--drawer__foot">{th.home.phase}</p>
          </nav>
        </>
      )}
    </header>
  );
}
