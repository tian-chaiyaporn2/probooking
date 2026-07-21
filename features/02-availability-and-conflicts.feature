Feature: Availability, Open to requests, and conflict prevention
  Ref: PRD §9.4(2), AVL-01..03
  No listed block means not shown as available. Confirmed bookings and accepted-offer
  holds block overlapping acceptance.

  Scenario: No availability block means not shown
    Given a professional with no availability blocks
    When a clinic searches for that time
    Then the professional is not shown as available

  Scenario: Professional can list an Available block including Open to requests
    Given a registered professional
    When they add an availability block with Open to requests
    Then the block is listed with the Open to requests flag set

  Scenario: Confirmed booking blocks an overlapping acceptance
    Given a professional with a confirmed booking from 09:00 to 12:00
    When they attempt to accept an overlapping offer from 10:00 to 13:00
    Then the overlapping acceptance is blocked

  Scenario: Accepted-offer soft hold blocks an overlapping acceptance
    Given a professional with an accepted-offer soft hold from 09:00 to 12:00
    When they attempt to accept an overlapping offer from 10:00 to 13:00
    Then the overlapping acceptance is blocked

  @wip
  Scenario: Open to requests is used when matching professionals to shifts
    Given a professional marked Open to requests with no fixed block for a window
    When a clinic searches for coverage in that window
    Then the professional is included as open-to-request supply
