locals {
  thresholds = [
    { percent = 25, type = "ACTUAL" },
    { percent = 50, type = "ACTUAL" },
    { percent = 75, type = "ACTUAL" },
    { percent = 90, type = "ACTUAL" },
    { percent = 100, type = "FORECASTED" }
  ]
}

resource "aws_budgets_budget" "monthly" {
  name              = "${var.name_prefix}-monthly-spend-budget"
  budget_type       = "COST"
  limit_amount      = var.monthly_budget_amount
  limit_unit        = "USD"
  time_unit         = "MONTHLY"
  time_period_start = "2024-01-01_00:00"

  dynamic "notification" {
    for_each = length(var.notification_emails) > 0 ? local.thresholds : []
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value.percent
      threshold_type             = "PERCENTAGE"
      notification_type          = notification.value.type
      subscriber_email_addresses = var.notification_emails
    }
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-budget"
    }
  )
}
