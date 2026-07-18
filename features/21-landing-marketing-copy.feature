# Landing marketing copy — acceptance criteria for Phase 0 marketing surface (LOC-01).
# Exercises centralised Thai strings; browser behaviour is covered by Playwright e2e.

Feature: Landing marketing copy
  As a product owner preparing the Phase 0 demo
  I want the landing copy to sell the promise honestly
  So visitors see customer language, clear CTAs, and concierge expectations

  Scenario: Hero uses market signal instead of internal phase jargon
    Given the landing marketing strings are loaded
    Then the hero eyebrow should be "กรุงเทพฯ และปริมณฑล · แพทย์และทันตแพทย์"
    And the hero lead should mention payment protection
    And the hero primary CTA should be "เริ่ม demo"

  Scenario: Contact path is defined for real-interest clinics
    Given the landing marketing strings are loaded
    Then the contact CTA should be "ติดต่อทีม concierge"
    And the contact email should be a valid mailbox address

  Scenario: How-it-works has clinic and professional perspectives
    Given the landing marketing strings are loaded
    Then the clinic how-it-works should have 4 steps
    And the professional how-it-works should have 4 steps
    And the guided demo path should mention clinic and professional roles

  Scenario: Demo accounts are grouped for party and staff
    Given the demo account catalogue is loaded
    Then there should be 2 party demo accounts
    And there should be 3 staff demo accounts
    And the guided demo path should mention operations and finance
    And every finance approver sublabel should be Thai-only
