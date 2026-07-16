Feature: Clinic authority and one active offer
  Ref: PRD §9.4(4), OFF-01..02
  Only a clinic owner/admin may send a binding offer. One active offer per shift.

  Scenario: Owner may send a binding offer
    Given a user with role "clinic_owner"
    When they attempt to send a binding offer
    Then the offer is sent

  Scenario: Clinic staff may not send a binding offer
    Given a user with role "clinic_staff"
    When they attempt to send a binding offer
    Then the action is forbidden

  Scenario: A professional may not send a binding offer
    Given a user with role "professional"
    When they attempt to send a binding offer
    Then the action is forbidden
