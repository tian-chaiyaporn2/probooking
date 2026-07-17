import { describe, it, expect } from "vitest";
import {
  aggregateRating,
  ratingFromCounts,
  reviewPublishDueAt,
  REVIEW_PUBLISH_AFTER,
} from "../src/reviews.js";

describe("reviews (REV-03/04)", () => {
  it("returns no rating below 3 published reviews (cold start, REV-04)", () => {
    expect(aggregateRating([5, 4])).toBeNull();
  });

  it("averages once at least 3 published reviews exist", () => {
    expect(aggregateRating([5, 4, 3])).toEqual({ count: 3, average: 4 });
  });

  it("auto-publish is 7 days after creation (REV-03)", () => {
    expect(reviewPublishDueAt(1000)).toBe(1000 + REVIEW_PUBLISH_AFTER);
  });
});

describe("ratingFromCounts (REV-04, pre-aggregated)", () => {
  it("applies the same cold-start floor as aggregateRating", () => {
    // A store that aggregates in SQL must not get a different answer from one that
    // fetches every score — the threshold is the rule, not an implementation detail.
    expect(ratingFromCounts(2, 5)).toBeNull();
    expect(ratingFromCounts(3, 4.5)).toEqual({ count: 3, average: 4.5 });
    expect(ratingFromCounts(0, 0)).toBeNull();
  });

  it("agrees with aggregateRating for the same underlying reviews", () => {
    const scores = [5, 4, 3];
    const fromScores = aggregateRating(scores);
    const fromCounts = ratingFromCounts(scores.length, scores.reduce((a, b) => a + b, 0) / scores.length);
    expect(fromCounts).toEqual(fromScores);
  });
});
