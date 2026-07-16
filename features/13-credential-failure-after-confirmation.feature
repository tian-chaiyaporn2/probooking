@wip
Feature: Credential or insurance failure after confirmation
  Ref: PRD §9.4(13), VER-04..06
  A required credential or insurance failure after confirmation places the booking
  on Hold for Operations review.

  Scenario: Licence expiry before shift end holds the booking
    Given a confirmed booking whose professional licence will expire before shift end
    When the credential is detected as invalid
    Then the booking is placed on Hold for Operations review

  Scenario: Required insurance lapse holds the booking
    Given a confirmed booking that requires insurance
    When the insurance becomes Expired before shift end
    Then the booking is placed on Hold for Operations review
