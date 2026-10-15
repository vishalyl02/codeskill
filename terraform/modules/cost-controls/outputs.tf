output "budget_id" {
  description = "ID of the AWS Budget"
  value       = aws_budgets_budget.monthly.id
}

output "budget_name" {
  description = "Name of the AWS Budget"
  value       = aws_budgets_budget.monthly.name
}

output "budget_limit_usd" {
  description = "Configured monthly spending limit in USD"
  value       = var.monthly_budget_amount
}

output "budget_notification_thresholds" {
  description = "Active budget notification thresholds"
  value       = ["25% ($25)", "50% ($50)", "75% ($75)", "90% ($90)", "100% (Forecasted)"]
}
