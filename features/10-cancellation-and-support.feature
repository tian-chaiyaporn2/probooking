Feature: Cancellation, no-show, partial work, and support outcomes
  Ref: PRD §9.4(10), CAN-01..05
  Cancellation compensation depends on actor, timing, and reason. Force majeure,
  safety, credential, provider failure, and partial work route to support.

  Scenario Outline: Clinic cancellation compensation by timing
    Given a clinic cancels an ordinary shift <hours> hours before start
    Then the professional payable fraction is <fraction>

    Examples:
      | hours | fraction |
      | 30    | 0        |
      | 5     | 0.5      |

  Scenario: Professional no-show pays 0 percent
    Given a professional no-show before work
    Then the professional payable fraction is 0

  Scenario: Partial work routes to support
    Given a shift with partial work
    Then the outcome is resolved by support
