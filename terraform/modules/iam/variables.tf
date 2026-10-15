variable "name_prefix" {
  description = "Prefix for IAM resource names"
  type        = string
  default     = "codeskill"
}

variable "s3_bucket_arn" {
  description = "ARN of S3 bucket for CodeSkill storage (optional)"
  type        = string
  default     = ""
}

variable "secrets_arn_prefix" {
  description = "ARN prefix for Secrets Manager secrets accessible by application"
  type        = string
  default     = "*"
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
