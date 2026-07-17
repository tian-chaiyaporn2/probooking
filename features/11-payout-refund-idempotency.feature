Feature: Payout/refund idempotency and different-person approval
  Ref: PRD §9.4(11), PAY-08..10, §3, §6.4, REP-01
  No duplicate payout or refund. High-value or unusual money actions require a
  second authorized person.

  Scenario: Duplicate payout command is a no-op
    Given a payout already marked Paid
    When the same payout command is retried
    Then no second payout is created

  Scenario: Payout may not exceed remaining allocated funds
    Given an allocation with 500000 satang available for payout
    When a payout of 600000 satang is attempted
    Then the payout is rejected

  Scenario: High-value payout requires a different second approver
    Given a high-value payout initiated by one Finance user
    Then it cannot be executed by the same user alone

  Scenario: Party booking history lists confirmed booking money columns
    Given a seeded confirmed booking for history
    When listing booking history for the clinic
    Then the history row matches the booking's compensation fee tax and total

  @wip
  Scenario: Refund output separates compensation fee tax and provider charges
    Given a cancelled booking with a refund
    When the refund statement is produced
    Then compensation platform fee tax adjustment and any provider charge are listed separately
