@wip
Feature: Payout/refund idempotency and different-person approval
  Ref: PRD §9.4(11), PAY-08..10, §3, §6.4
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
