Feature: Cancellation money mechanics — success/edge/error cases
  Ref: PRD §9.4(10), CAN-01..05, PAY-07
  Cancellation compensation depends on actor/timing/reason, always conserves captured
  funds across payout + refund, and is idempotent.

  Scenario Outline: Compensation fraction by actor, timing, and arrival
    Given a "<actor>" cancels with reason "<reason>" <hours> hours before start and arrived "<arrived>"
    Then the payable fraction is <fraction>

    Examples:
      | actor        | reason                            | hours | arrived | fraction |
      | clinic       | ordinary                          | 30    | false   | 0        |
      | clinic       | ordinary                          | 5     | false   | 0.5      |
      | clinic       | clinic_unavailable_after_arrival  | 0     | true    | 1        |
      | professional | ordinary                          | 10    | false   | 0        |

  Scenario: Support reasons route to support instead of a fraction
    Given a "clinic" cancels with reason "force_majeure" 2 hours before start and arrived "false"
    Then the outcome routes to support

  Scenario: Cancellation conserves captured funds across payout and refund
    Given a confirmed booking worth 1000000 satang compensation
    When it is cancelled at a 0.5 payable fraction
    Then payout plus refund equals captured

  Scenario: A second cancellation is idempotent
    Given a confirmed booking worth 1000000 satang compensation
    When it is cancelled twice at a 0 payable fraction
    Then the second cancellation is rejected as already cancelled
