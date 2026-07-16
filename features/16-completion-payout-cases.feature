Feature: Completion and payout — success/edge/error cases
  Ref: PRD §9.4(9/11), CMP-01..03, PAY-07..09, §6.4
  Completion releases the protected compensation to the professional exactly once;
  conservation holds after payout, and a held booking cannot pay out.

  Scenario: Success — completion pays out and conservation holds after payout
    Given a confirmed booking worth 1000000 satang compensation
    When the professional completes and the clinic accepts completion
    Then the professional is paid the compensation
    And captured funds conserve after payout

  Scenario: Edge — accepting completion twice pays out only once
    Given a confirmed booking worth 1000000 satang compensation
    When completion is accepted twice
    Then only one payout is recorded

  Scenario: Edge — marking completion twice leaves it awaiting completion
    Given a confirmed booking worth 1000000 satang compensation
    When completion is submitted twice
    Then the booking is awaiting completion

  Scenario: Error — a cancelled booking can never be completed
    Given a cancelled booking state
    Then advancing it to awaiting completion is rejected

  Scenario: A credential hold blocks payout until Operations resolves it
    Given a confirmed booking worth 1000000 satang compensation
    When Operations places a credential hold
    Then the booking is marked held
    And resolving the hold clears it
