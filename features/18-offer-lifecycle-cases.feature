Feature: Offer and application lifecycle — success/edge/error cases
  Ref: PRD §9.4(3/4/5), OFF-01..04, APP-01
  One active offer per shift; only a clinic owner sends a binding offer; acceptance is
  a soft hold, and an expired offer can never be accepted.

  Scenario: Success — a shift accepts one active offer
    Given a shift with a candidate professional
    When the clinic sends an offer
    Then the offer is created in PendingResponse

  Scenario: Error — a second active offer on the same shift is rejected
    Given a shift with a candidate professional
    And the clinic has already sent an active offer
    When the clinic sends another offer
    Then the second offer is rejected

  Scenario: Edge — a professional cannot apply to the same shift twice
    Given a shift with a candidate professional
    When the professional applies again
    Then the duplicate application is rejected

  Scenario: Only a clinic owner may send a binding offer (OFF-01)
    Then role "clinic_owner" may send an offer
    But role "professional" may not send an offer

  Scenario: An expired offer can never be accepted (OFF-03)
    Then accepting an offer in state "Expired" is rejected

  Scenario: A professional declines a pending offer (OFF: PendingResponse -> Declined)
    Given a shift with a candidate professional
    When the clinic sends an offer
    And the professional declines the offer
    Then the offer is in "Declined"

  Scenario: A declined offer is terminal — it can never be accepted
    Then accepting an offer in state "Declined" is rejected
