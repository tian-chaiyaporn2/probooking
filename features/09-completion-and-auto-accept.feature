@wip
Feature: Completion, auto-accept, clinic fallback, and Operations queue
  Ref: PRD §9.4(9), CMP-01..05
  Professional may mark Arrived/Completed without GPS or QR. Auto-accept occurs once
  after 24 hours; clinic inactivity beyond 48 hours routes to Operations.

  Scenario: Auto-accept once after 24 hours
    Given a professional submitted completion
    When 24 hours pass from the later of scheduled end and submission
    And the booking is not held or disputed
    Then completion is auto-accepted exactly once

  Scenario: Clinic inactivity routes to Operations after 48 hours
    Given the professional did not submit completion
    And the clinic has been inactive for 48 hours
    Then Operations reviews the completion
