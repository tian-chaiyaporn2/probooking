import { describe, it, expect } from "vitest";
import { aggregateRating, reviewPublishDueAt, REVIEW_PUBLISH_AFTER } from "../src/reviews.js";

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
