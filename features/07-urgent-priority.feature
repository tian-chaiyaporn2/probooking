Feature: Urgent priority without guarantee
  Ref: PRD §9.4(7), URG-01
  Shifts within 72 hours may receive an Urgent badge, priority placement, alerts,
  and assisted outreach — with no fill guarantee.

  Scenario: Urgent badge within the 72-hour window
    Given a supported shift starting in 48 hours
    Then it may receive an Urgent badge and priority placement

  Scenario: Urgent never implies a guaranteed fill
    Given an urgent shift
    Then no fill is guaranteed
