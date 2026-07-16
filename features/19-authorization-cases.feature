Feature: Authorization capability matrix — who may do what (§3)
  Ref: PRD §9.4(11), §3, §6.4, OFF-01, AUTH
  Least-privilege capabilities per role; high-value money actions require dual control.

  Scenario Outline: A role either has or lacks a capability
    Then role "<role>" <allowed> capability "<capability>"

    Examples:
      | role         | allowed  | capability             |
      | clinic_owner | can      | clinic.publish_shift   |
      | clinic_owner | can      | clinic.send_offer      |
      | clinic_staff | cannot   | clinic.send_offer      |
      | professional | can      | pro.apply              |
      | professional | cannot   | clinic.publish_shift   |
      | operations   | can      | ops.verify             |
      | operations   | cannot   | finance.execute_payout |
      | finance      | can      | finance.execute_payout |
      | finance      | cannot   | ops.verify             |
      | administrator| can      | admin.manage_access    |

  Scenario Outline: Dual control is required for high-value money actions only
    Then capability "<capability>" <requirement> dual control

    Examples:
      | capability             | requirement |
      | finance.execute_payout | requires    |
      | finance.execute_refund | requires    |
      | pro.apply              | skips       |
