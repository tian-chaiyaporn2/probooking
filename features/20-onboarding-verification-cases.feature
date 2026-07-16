Feature: Onboarding and verification — success/edge/error cases
  Ref: PRD §9.4(1), ORG-01, PRO-01, VER-01..04
  Registration is unique per phone; verification is idempotent; suspension is reflected
  in the public profile without erasing that the identity was verified.

  Scenario: Success — a verified professional's licence reads Verified
    Given a registered professional
    When Operations verifies the professional
    Then the professional's licence reads "Verified"
    And the identity is marked verified

  Scenario: Edge — verifying an already-verified professional is idempotent
    Given a registered professional
    When Operations verifies the professional twice
    Then the professional stays "Verified"

  Scenario: Suspension is reflected in the profile but keeps the verified identity
    Given a registered professional
    When Operations verifies then suspends the professional
    Then the professional's licence reads "Suspended"
    And the identity is marked verified

  Scenario: Error — verifying an unknown professional is not found
    Given a fresh store
    Then verifying an unknown professional returns not found

  Scenario: Error — registering a duplicate phone conflicts
    Given a registered professional
    Then registering another professional with the same phone conflicts
