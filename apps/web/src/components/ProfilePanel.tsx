"use client";

import { Badge } from "./Badge";
import { ShieldCheckIcon } from "./icons";
import type { VerifiedProfile } from "../lib/api";
import { statusLabel, professionLabel } from "../lib/status";
import { th } from "../lib/strings";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Compact VER-03 profile panel: self-declared vs verified facts. */
export function ProfilePanel({ profile }: { profile: VerifiedProfile }) {
  const { selfDeclared, verified } = profile;
  return (
    <div className="identity-card" data-testid="profile-panel">
      <div className="identity-card__avatar" aria-hidden>
        {initials(selfDeclared.displayName)}
      </div>
      <div className="identity-card__body">
        <div className="identity-card__title-row">
          <h2 className="identity-card__title">{th.party.profileTitle}</h2>
          {verified.identityVerified ? (
            <span className="identity-card__verified">
              <ShieldCheckIcon />
              {th.party.identityVerified}
            </span>
          ) : null}
        </div>
        <p className="identity-card__name">{selfDeclared.displayName}</p>
        <p className="identity-card__meta muted">
          {professionLabel(selfDeclared.profession)}
          {selfDeclared.specialty ? ` · ${selfDeclared.specialty}` : ""}
        </p>
        <div className="identity-card__chips">
          {!verified.identityVerified ? (
            <Badge tone="warn">{th.party.identityPending}</Badge>
          ) : null}
          {verified.licence ? (
            <Badge tone="info">
              {th.party.licence}: {statusLabel(verified.licence.state)}
            </Badge>
          ) : null}
          {verified.insurance ? (
            <Badge tone="info">
              {th.party.insurance}: {statusLabel(verified.insurance.state)}
            </Badge>
          ) : null}
          {verified.rating ? (
            <Badge tone="success">
              ★ {verified.rating.average.toFixed(1)} ({verified.rating.count})
            </Badge>
          ) : (
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {th.party.ratingColdStart}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
