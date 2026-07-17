Feature: Offer expiry, soft hold, payment, and atomic confirmation
  Ref: PRD §9.4(5), OFF-03..04, BKG-01..02, §6.3
  Acceptance creates a soft hold, not a booking. Confirmation requires durable
  prefunding and final eligibility, and is atomic.

  Scenario: Acceptance creates a soft hold, not a booking
    Given a user with role "professional"
    When acceptance is applied to the offer
    Then the offer awaits payment rather than becoming a booking

  Scenario: An offer cannot convert before payment
    Given a user with role "professional"
    Then converting the offer before payment is rejected

  Scenario: Late payment after offer expiry never creates a booking
    Given an offer that has expired
    When durable prefunding arrives after expiry
    Then no booking is created
    And the payment enters refund or payment-exception handling

  Scenario: Urgent offer expires in 2 hours or by shift start whichever sooner
    Given an urgent offer sent at a known time before a near shift start
    Then the effective offer expiry is the earlier of the 2-hour timer and shift start

  Scenario: Standard offer expires in 12 hours or by shift start whichever sooner
    Given a standard offer sent at a known time well before shift start
    Then the effective offer expiry is sent-at plus 12 hours
