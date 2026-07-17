Feature: Urgent priority without guarantee
  Ref: PRD §9.4(7), URG-01, SRC-03
  Shifts within 72 hours may receive an Urgent badge, priority placement, alerts,
  and assisted outreach — with no fill guarantee.

  Scenario: Urgent badge within the 72-hour window
    Given a supported shift starting in 48 hours
    Then it may receive an Urgent badge and priority placement

  Scenario: Urgent shifts sort ahead of standard open shifts
    Given one urgent and one standard published open shift
    When listing open shifts
    Then the urgent shift appears first

  Scenario: Urgent never implies a guaranteed fill
    Given an urgent shift
    Then no fill is guaranteed
    And no booking exists for that shift
