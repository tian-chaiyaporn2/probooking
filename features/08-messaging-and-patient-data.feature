Feature: Messaging and patient-data rules
  Ref: PRD §9.4(8), MSG-01..02, §7.3
  Plain-text thread only; contact details appear after confirmation. Patient data
  is prohibited; warnings, reporting, and manual removal are sufficient for Phase 1.

  Scenario: Contact details hidden until confirmation
    Given an accepted offer awaiting payment
    Then contact details are not available for that offer
    When the offer is confirmed into a booking
    Then contact details reveal both party phones

  Scenario: Plain-text messages round-trip on a confirmed booking
    Given a confirmed booking with a message thread
    When a party posts a plain-text message
    Then the thread lists that message body

  Scenario: Patient-identifiable content is discouraged and removable
    Given a message containing apparent patient-identifiable data
    Then the user is warned and the content can be reported and manually removed
