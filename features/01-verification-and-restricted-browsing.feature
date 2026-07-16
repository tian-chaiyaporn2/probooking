Feature: Verification and restricted browsing
  Ref: PRD §9.4(1), AUTH-04, VER-01..03
  Unverified users may browse restricted public content but cannot transact.
  Public profiles separate verified facts from self-declared content.

  Scenario: Unverified user may browse but not transact
    Given an unverified user
    When they view public content
    Then they can browse restricted public content
    But they cannot apply, invite, offer, or pay

  Scenario: Public profile separates verified from self-declared facts
    Given a professional with a verified licence and a self-declared bio
    When a clinic views the public profile
    Then verified facts are labelled with a last-checked date
    And self-declared content is clearly distinguished
