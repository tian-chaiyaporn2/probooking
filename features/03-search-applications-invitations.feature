Feature: Search, empty results, applications, and invitations
  Ref: PRD §9.4(3), SRC-01..04, APP-01
  Empty results offer shift posting and matching assistance. Applications and
  invitations are non-binding and reserve neither party.

  Scenario: Empty search offers posting and assistance
    Given a clinic search that matches no professionals
    When the results render
    Then the clinic is offered shift posting and matching assistance

  Scenario: Applications and invitations reserve neither party
    Given a professional applies to a shift
    Then no schedule hold is created for either party
