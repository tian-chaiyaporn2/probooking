@wip
Feature: Reviews, cold-start safeguards, and related-party exclusion
  Ref: PRD §9.4(12), REV-01..05
  Only completed paid production bookings create review rights. Aggregate rating and
  rating-based sorting begin after three published reviews.

  Scenario: Only completed paid bookings create review rights
    Given a cancelled booking
    Then neither party may leave a review

  Scenario: Aggregate rating starts after three published reviews
    Given a professional with two published reviews
    Then no aggregate rating or rating-based sorting is shown

  Scenario: Related-party transactions create no public reputation
    Given a related-party booking
    Then it creates no public reputation
