variable "name_prefix" {
  description = "Prefix for Judge0 resources"
  type        = string
  default     = "codeskill"
}

variable "instance_type" {
  description = "EC2 instance type for Judge0 host (x86_64 m7i-flex.large recommended for 2 vCPU, 8 GiB RAM)"
  type        = string
  default     = "m7i-flex.large"
}

variable "ami_id" {
  description = "Specific AMI ID for Judge0. If empty, latest Amazon Linux 2023 x86_64 AMI is automatically resolved"
  type        = string
  default     = ""
}

variable "subnet_ids" {
  description = "Subnet IDs for Judge0 deployment"
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security Group IDs for Judge0 instance"
  type        = list(string)
}

variable "iam_instance_profile_name" {
  description = "IAM instance profile name for Judge0"
  type        = string
}

variable "min_size" {
  description = "Minimum number of primary Judge0 instances"
  type        = number
  default     = 1
}

variable "desired_capacity" {
  description = "Desired number of primary Judge0 instances"
  type        = number
  default     = 1
}

variable "max_size" {
  description = "Maximum number of primary Judge0 instances (1 initially)"
  type        = number
  default     = 1
}

variable "root_volume_size" {
  description = "Root gp3 volume size in GiB"
  type        = number
  default     = 40
}

variable "user_data_base64" {
  description = "Base64-encoded user data script for Judge0"
  type        = string
  default     = ""
}

# Future Worker Auto Scaling settings
variable "judge0_worker_autoscaling_enabled" {
  description = "Set to true to enable separate worker Auto Scaling group once shared execution queue is verified. Kept FALSE by default to avoid extra costs."
  type        = bool
  default     = false
}

variable "judge0_worker_instance_type" {
  description = "EC2 instance type for optional Judge0 workers"
  type        = string
  default     = "m7i-flex.large"
}

variable "judge0_worker_min_size" {
  description = "Minimum number of optional Judge0 worker instances"
  type        = number
  default     = 1
}

variable "judge0_worker_desired_capacity" {
  description = "Desired number of optional Judge0 worker instances"
  type        = number
  default     = 1
}

variable "judge0_worker_max_size" {
  description = "Maximum number of optional Judge0 worker instances"
  type        = number
  default     = 3
}

variable "worker_user_data_base64" {
  description = "Base64-encoded user data script for separate Judge0 worker instances"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
