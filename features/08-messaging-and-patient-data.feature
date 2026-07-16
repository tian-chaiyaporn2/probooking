@wip
Feature: Messaging and patient-data rules
  Ref: PRD §9.4(8), MSG-01..02, §7.3
  Plain-text thread only; contact details appear after confirmation. Patient data
  is prohibited; warnings, reporting, and manual removal are sufficient for Phase 1.

  Scenario: Contact details hidden until confirmation
    Given a booking that is not yet confirmed
    Then contact details are not shown in the thread

  Scenario: Patient-identifiable content is discouraged and removable
    Given a message containing apparent patient-identifiable data
    Then the user is warned and the content can be reported and manually removed
