Feature: Completion, auto-accept, clinic fallback, and Operations queue
  Ref: PRD §9.4(9), CMP-01..05
  Professional may mark Arrived/Completed without GPS or QR. Auto-accept occurs once
  after 24 hours; clinic inactivity beyond 48 hours routes to Operations.

  Scenario: Submitting completion stamps a 24h auto-accept deadline
    Given a confirmed booking ready for completion
    When the professional marks completion
    Then an auto-accept deadline is stamped 24 hours from the later of end and submission
    And marking completion again leaves the deadline unchanged

  Scenario: Auto-accept once after 24 hours
    Given a confirmed booking past its auto-accept deadline
    When auto-accept pays out the professional
    Then the booking is ServiceCompleted and Paid
    And a second auto-accept payout is rejected

  Scenario: Clinic inactivity opens an Operations completion_review case
    Given a confirmed booking past scheduled end with no completion submitted
    When Operations flags the booking inactive
    Then a support case of kind "completion_review" is Open
    And flagging again returns the same case

  Scenario: Clinic inactivity routes to Operations after 48 hours
    Given a confirmed booking past the clinic completion-review deadline
    Then Operations may open a completion_review case

  @wip
  Scenario: Clinic may confirm full completion when the professional did not submit
    Given a confirmed booking past scheduled end with no professional completion
    When the clinic confirms full completion
    Then the booking reaches ServiceCompleted and payout proceeds

  @wip
  Scenario: Overtime partial work shortened shifts and disputed attendance require support
    Given a completed shift with overtime or shortened hours or disputed attendance
    When compensation is finalized
    Then the outcome is resolved by support rather than the scheduled default alone
