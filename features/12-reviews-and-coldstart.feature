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

  Scenario: Rating appears only after three published store reviews
    Given a professional with three completed bookings and published review pairs
    When the subject rating is requested
    Then an aggregate rating is returned
    And with only two published scores it remains hidden

  Scenario: Related-party transactions create no public reputation
    Given a related-party booking
    Then it creates no public reputation

  @wip
  Scenario: Related-party self-dealing and test bookings are excluded from store ratings
    Given a related-party or self-dealing completed booking with published reviews
    When the subject rating is requested
    Then those scores do not count toward the public aggregate
