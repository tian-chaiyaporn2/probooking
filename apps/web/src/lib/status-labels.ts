import { th } from "./strings";

const offer = th.status.offer as Record<string, string>;
const booking = th.status.booking as Record<string, string>;
const payout = th.status.payout as Record<string, string>;
const verification = th.status.verification as Record<string, string>;
const caseState = th.status.case as Record<string, string>;
const application = th.status.application as Record<string, string>;

export function labelOfferState(state: string): string {
  return offer[state] ?? state;
}

export function labelBookingState(state: string): string {
  return booking[state] ?? state;
}

export function labelPayoutState(state: string): string {
  return payout[state] ?? state;
}

export function labelVerificationState(state: string): string {
  return verification[state] ?? state;
}

export function labelCaseState(state: string): string {
  return caseState[state] ?? state;
}

export function labelShiftState(state: string, opts?: { booked?: boolean; hasOffer?: boolean; candidateCount?: number }): string {
  if (opts?.booked) return th.status.shift.booked;
  if (opts?.hasOffer) return th.status.shift.hasOffer;
  const count = opts?.candidateCount ?? 0;
  if (count > 0) return th.status.shift.hasApplicants(count);
  const map: Record<string, string> = {
    Published: th.status.shift.Published,
    booked: th.status.shift.booked,
    hasOffer: th.status.shift.hasOffer,
  };
  return map[state] ?? state;
}

export function labelApplicationState(state: string): string {
  return application[state] ?? state;
}

export function labelCategory(category: string): string {
  const map = th.categories as Record<string, string>;
  return map[category] ?? category;
}

export function labelProfession(profession: string): string {
  const map = th.professions as Record<string, string>;
  return map[profession] ?? profession;
}
