Feature: Search, empty results, applications, and invitations
  Ref: PRD §9.4(3), SRC-01..04, APP-01
  Empty results offer shift posting and matching assistance. Applications and
  invitations are non-binding and reserve neither party.

  Scenario: Empty search yields no professionals
    Given a clinic search that matches no professionals
    When the results render
    Then the search returns no professionals
    And the clinic is offered shift posting and matching assistance

  Scenario: Verified professionals filter by profession
    Given a verified nurse and a verified dental_assistant
    When searching professionals by profession "nurse"
    Then only the nurse is returned

  Scenario: Open shifts filter by category urgency and compensation and sort urgent then soonest
    Given published shifts with mixed urgency compensation and start times
    When listing open shifts filtered to category "general" with max compensation 2000000
    Then only matching shifts are returned
    And urgent shifts appear before standard ones
    And within the same urgency sooner starts appear first

  Scenario: Applications and invitations reserve neither party
    Given a professional applies to a shift
    Then no schedule hold is created for either party

  Scenario: An invitation creates no schedule hold
    Given a clinic invites a professional to a shift
    Then no schedule hold is created for either party

  @wip
  Scenario: Professionals filter by availability and location
    Given verified professionals with location and availability metadata
    When searching with availability and location filters
    Then only professionals matching those filters are returned
