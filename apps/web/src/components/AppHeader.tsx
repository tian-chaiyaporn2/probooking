"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { th } from "../lib/strings";
import {
  clearSession,
  loadSession,
  onSessionChange,
  type SessionRole,
} from "../lib/session";
import { DEMO_ACCOUNTS } from "../lib/demo-accounts";
import { ThemeToggle } from "./ThemeToggle";
import { MenuIcon, CloseIcon } from "./icons";

type NavLink = {
  href: string;
  label: string;
  onClick?: () => void;
};

const DRAWER_MQ = "(min-width: 960px)";

function roleLabel(role: SessionRole): string {
  const match = DEMO_ACCOUNTS.find((a) => a.role === role);
  if (match) return match.label;
  if (role === "clinic") return th.party.navClinic;
  if (role === "professional") return th.party.navPro;
  if (role === "operations") return th.nav.ops;
  if (role === "finance") return th.nav.finance;
  return role;
}

function workspaceLink(role: SessionRole): NavLink | null {
  if (role === "clinic")
    return { href: "/clinic", label: th.party.navClinic };
  if (role === "professional") return { href: "/pro", label: th.party.navPro };
  if (role === "operations") return { href: "/ops", label: th.nav.ops };
  if (role === "finance") return { href: "/finance", label: th.nav.finance };
  return null;
}

function publicLinks(signedIn: boolean): NavLink[] {
  const links: NavLink[] = [
    { href: "/", label: th.nav.home },
    { href: "/journey", label: th.nav.journey },
  ];
  if (!signedIn) links.push({ href: "/signin", label: th.nav.signin });
  return links;
}

/**
 * Shared app shell header: brand + context-aware nav + theme toggle.
 * Party users see their workspace; staff see ops/finance; signed-out users see public links only.
 * Flow smoke test is footer-only — not in the primary nav.
 */
export function AppHeader({ current }: { current?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<ReturnType<typeof loadSession>>(null);
  const drawerId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const refresh = () => setSession(loadSession());
    refresh();
    return onSessionChange(refresh);
  }, [current]);

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

  const signedIn = Boolean(session?.token);
  const role = session?.role;
  const links: NavLink[] = [...publicLinks(signedIn)];
  const workspace = role ? workspaceLink(role) : null;
  if (workspace) links.push(workspace);

  function signOut() {
    clearSession();
    setOpen(false);
    router.push("/");
  }

  function renderLinks(navLinks: NavLink[], onNavigate?: () => void) {
    return navLinks.map((l) => (
      <Link
        key={l.href + l.label}
        href={l.href}
        aria-current={current === l.href ? "page" : undefined}
        onClick={() => {
          l.onClick?.();
          onNavigate?.();
        }}
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

        <nav
          className="app-nav app-nav--desktop"
          aria-label={th.a11y.primaryNav}
        >
          {renderLinks(links)}
          {signedIn && role ? (
            <span className="account-chip" data-testid="account-chip">
              {roleLabel(role)}
            </span>
          ) : null}
          {signedIn ? (
            <button
              type="button"
              className="nav-signout"
              data-testid="nav-signout"
              onClick={signOut}
            >
              {th.nav.signOut}
            </button>
          ) : null}
        </nav>

        <div className="app-header__right">
          {signedIn && role ? (
            <span
              className="account-chip account-chip--compact"
              data-testid="account-chip-mobile"
            >
              {roleLabel(role)}
            </span>
          ) : null}
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
          <button
            className="nav-backdrop"
            aria-label={th.a11y.closeMenu}
            onClick={() => setOpen(false)}
          />
          <nav
            ref={drawerRef}
            id={drawerId}
            className="app-nav--drawer"
            aria-label={th.a11y.primaryNav}
            role="dialog"
            aria-modal="true"
          >
            <div className="app-nav--drawer__top">
              <span className="app-nav--drawer__title">
                {th.a11y.primaryNav}
              </span>
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
            {signedIn && role ? (
              <p className="app-nav--drawer__account" data-testid="drawer-account">
                {th.nav.accountLabel(roleLabel(role))}
              </p>
            ) : null}
            <p className="app-nav--drawer__group">{th.nav.publicGroup}</p>
            {renderLinks(links, () => setOpen(false))}
            {signedIn ? (
              <button
                type="button"
                className="nav-drawer-signout"
                data-testid="drawer-signout"
                onClick={signOut}
              >
                {th.nav.signOut}
              </button>
            ) : null}
            <p className="app-nav--drawer__foot">{th.home.marketSignal}</p>
          </nav>
        </>
      )}
    </header>
  );
}
