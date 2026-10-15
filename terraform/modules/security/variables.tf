variable "name_prefix" {
  description = "Prefix to apply to all resource names"
  type        = string
  default     = "codeskill"
}

variable "vpc_id" {
  description = "VPC ID where security groups will be created"
  type        = string
}

variable "allowed_ssh_cidr_blocks" {
  description = "List of CIDR blocks allowed SSH access. Defaults to empty list for zero open SSH (SSM Session Manager is used)."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
