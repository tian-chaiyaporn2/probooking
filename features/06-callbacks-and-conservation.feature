@wip
Feature: Late/duplicate callbacks and financial conservation
  Ref: PRD §9.4(6), PAY-04..08
  Provider callbacks and money commands are authenticated and idempotent. Captured
  funds must equal the sum of all downstream allocations.

  Scenario: Duplicate provider callback is idempotent
    Given a payment order that is already Payment Protected
    When the same provider callback is delivered again
    Then no additional financial event is created

  Scenario: Financial conservation holds after payout and fee
    Given a captured payment order of 560000 satang
    When 500000 is paid out and 60000 is taken as fee
    Then captured funds equal protected remainder plus payout, fee, tax, refunds, costs, and adjustments
