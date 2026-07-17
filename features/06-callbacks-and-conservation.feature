Feature: Late/duplicate callbacks and financial conservation
  Ref: PRD §9.4(6), PAY-04..08, LOC-02, PAY-02
  Provider callbacks and money commands are authenticated and idempotent. Captured
  funds must equal the sum of all downstream allocations. Money is integer satang.

  Scenario: Duplicate provider callback is idempotent
    Given a payment order that is already Payment Protected
    When the same provider callback is delivered again
    Then no additional financial event is created

  Scenario: Financial conservation holds after payout and fee
    Given a captured payment order of 560000 satang
    When 500000 is paid out and 60000 is taken as fee
    Then captured funds equal protected remainder plus payout, fee, tax, refunds, costs, and adjustments

  Scenario: Store-recorded confirmation and payout conserve captured funds
    Given a confirmed booking with recorded collection
    When the professional is paid the scheduled compensation
    Then the booking's captured funds equal compensation plus fee plus tax with zero remainder
    And reconciliation reports no conservation exceptions

  Scenario: Checkout amounts are integer satang with a 12 percent fee
    Given compensation of 1000000 satang
    Then checkout yields service fee 120000 and total 1120000
    And non-integer satang amounts are rejected
