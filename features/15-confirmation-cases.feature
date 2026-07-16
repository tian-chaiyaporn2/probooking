Feature: Confirmation eligibility and atomic booking — success/edge/error cases
  Ref: PRD §9.4(5), §6.3, BKG-01..02, PAY-07
  Every confirmation gate is checked at confirm time; a booking is created atomically
  only when all gates pass, and captured funds conserve.

  Scenario: Success — an eligible confirmation creates a booking and conserves funds
    Given an eligible confirmation
    When the offer is confirmed
    Then a booking is created
    And captured funds conserve

  Scenario: Edge — a duplicate confirmation returns the same booking (idempotent)
    Given an eligible confirmation
    When the offer is confirmed twice
    Then only one booking exists for the offer

  Scenario Outline: Error — an ineligible confirmation is rejected with a reason
    Given a confirmation that fails "<gate>"
    When eligibility is evaluated
    Then confirmation is rejected because of "<reason>"

    Examples:
      | gate                  | reason                             |
      | clinic_unverified     | clinic_not_active_verified         |
      | professional_suspended| suspended                          |
      | insurance_invalid     | insurance_invalid_through_shift_end|
      | schedule_overlap      | schedule_overlap                   |
      | offer_expired         | offer_expired                      |
      | prefunding_failed     | prefunding_failed                  |
