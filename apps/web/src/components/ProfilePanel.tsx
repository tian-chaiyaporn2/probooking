"use client";

import { Badge } from "./Badge";
import type { VerifiedProfile } from "../lib/api";
import { statusLabel, professionLabel } from "../lib/status";
import { th } from "../lib/strings";
import { verificationBadgeTone } from "../lib/tones";

/** Compact VER-03 profile panel: self-declared vs verified facts. */
export function ProfilePanel({ profile }: { profile: VerifiedProfile }) {
  const { selfDeclared, verified } = profile;
  return (
    <div
      className="card card--pad"
      data-testid="profile-panel"
      style={{ marginBottom: "var(--s5)" }}
    >
      <h2>{th.party.profileTitle}</h2>
      <p style={{ margin: "0 0 var(--s3)" }}>
        <strong>{selfDeclared.displayName}</strong>
        <span className="muted">
          {" "}
          · {professionLabel(selfDeclared.profession)}
          {selfDeclared.specialty ? ` · ${selfDeclared.specialty}` : ""}
        </span>
      </p>
      <div className="actions" style={{ flexWrap: "wrap", gap: "var(--s2)" }}>
        <Badge tone={verified.identityVerified ? "success" : "warn"}>
          {verified.identityVerified
            ? th.party.identityVerified
            : th.party.identityPending}
        </Badge>
        {verified.licence ? (
          <Badge tone={verificationBadgeTone(verified.licence.state)}>
            {th.party.licence}: {statusLabel(verified.licence.state)}
          </Badge>
        ) : null}
        {verified.insurance ? (
          <Badge tone={verificationBadgeTone(verified.insurance.state)}>
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
  );
}
