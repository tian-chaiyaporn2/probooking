"use client";

import { Badge } from "./Badge";
import { ShieldCheckIcon } from "./icons";
import type { VerifiedProfile } from "../lib/api";
import { statusLabel, professionLabel } from "../lib/status";
import { th } from "../lib/strings";

/** VER-03 readiness strip — trust facts without repeating the home hero name. */
export function ProfilePanel({
  profile,
  bookable,
}: {
  profile: VerifiedProfile;
  bookable?: boolean;
}) {
  const { selfDeclared, verified } = profile;
  const ready = bookable ?? verified.identityVerified;
  return (
    <div
      className="identity-card identity-card--home identity-card--trust"
      data-testid="profile-panel"
    >
      <div className="identity-card__body">
        <div className="identity-card__title-row">
          <h2 className="identity-card__title">{th.party.profileTitle}</h2>
          <span
            className={`identity-card__status${ready ? " identity-card__status--ready" : ""}`}
          >
            {ready ? (
              <>
                <ShieldCheckIcon />
                {th.party.bookableReady}
              </>
            ) : (
              th.party.bookablePending
            )}
          </span>
        </div>
        <p className="identity-card__meta muted" style={{ marginTop: 0 }}>
          {professionLabel(selfDeclared.profession)}
          {selfDeclared.specialty ? ` · ${selfDeclared.specialty}` : ""}
        </p>
        <div className="identity-card__chips">
          {!verified.identityVerified ? (
            <Badge tone="warn">{th.party.identityPending}</Badge>
          ) : (
            <Badge tone="success">{th.party.identityVerified}</Badge>
          )}
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
        <p className="identity-card__trust muted">{th.party.homeTrustLine}</p>
      </div>
    </div>
  );
}
