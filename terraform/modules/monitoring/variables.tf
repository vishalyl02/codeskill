variable "name_prefix" {
  description = "Prefix for monitoring resources"
  type        = string
  default     = "codeskill"
}

variable "prometheus_scrape_interval" {
  description = "Scrape interval for Prometheus in seconds"
  type        = string
  default     = "15s"
}

variable "loki_retention_period" {
  description = "Log retention period for Loki (e.g. 168h for 7 days)"
  type        = string
  default     = "168h"
}

variable "grafana_admin_password" {
  description = "Admin password for Grafana OSS portal"
  type        = string
  default     = "CodeSkillGrafanaSecure2024!"
  sensitive   = true
}

variable "alert_email" {
  description = "Optional alert email address for SNS budget and incident notifications"
  type        = string
  default     = ""
}

# Legacy compatibility variables (kept optional so environments/production continues to validate)
variable "aws_region" {
  description = "AWS region (optional)"
  type        = string
  default     = "ap-south-1"
}

variable "app_asg_name" {
  description = "Application ASG name (optional)"
  type        = string
  default     = ""
}

variable "asg_name" {
  description = "Legacy ASG name (optional)"
  type        = string
  default     = ""
}

variable "judge0_asg_name" {
  description = "Judge0 ASG name (optional)"
  type        = string
  default     = ""
}

variable "alb_arn_suffix" {
  description = "ALB ARN suffix (optional)"
  type        = string
  default     = ""
}

variable "target_group_arn_suffix" {
  description = "Target Group ARN suffix (optional)"
  type        = string
  default     = ""
}

variable "db_identifier" {
  description = "RDS DB instance identifier (optional)"
  type        = string
  default     = ""
}

variable "redis_cluster_id" {
  description = "Redis cluster ID (optional)"
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "Log retention in days (optional)"
  type        = number
  default     = 7
}

variable "tags" {
  description = "Tags for monitoring resources"
  type        = map(string)
  default     = {}
}
