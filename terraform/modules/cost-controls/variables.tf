variable "name_prefix" {
  description = "Prefix for cost control resources"
  type        = string
  default     = "codeskill"
}

variable "monthly_budget_amount" {
  description = "Monthly budget limit in USD"
  type        = string
  default     = "100"
}

variable "notification_emails" {
  description = "List of email addresses to receive budget alerts at $25, $50, $75, and $90 thresholds"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags for cost-control resources"
  type        = map(string)
  default     = {}
}
