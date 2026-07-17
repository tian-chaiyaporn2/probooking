Feature: Derived customer status and immutable audit history
  Ref: PRD §9.4(14), §6.2, §6.4, REP-03
  Customer labels are derived from owning records. Holds and cases are overlays that
  do not overwrite history. Every privileged change is audited and immutable.

  Scenario: Customer label is derived, not stored as truth
    Given an offer in AwaitingPayment
    Then the customer sees a derived "Awaiting Payment" label
    And changing the label does not alter the owning offer record

  Scenario: A hold overlays without overwriting base state
    Given a confirmed booking
    When an Operations hold is applied
    Then the booking base state is preserved
    And the hold is recorded as an overlay

  Scenario: Privileged changes are audited immutably
    Given any privileged change is executed
    Then an immutable audit record captures actor, authority, time, before, and after

  Scenario: Ops metrics reflect confirmed bookings and open cases
    Given a confirmed booking and an open support case
    When Ops metrics are requested
    Then metrics count at least one confirmed booking and one open case
