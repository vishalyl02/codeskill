variable "name_prefix" {
  description = "Prefix for application ASG resources"
  type        = string
  default     = "codeskill"
}

variable "instance_type" {
  description = "EC2 instance type for shared Application (Next.js + NestJS). Defaults to ARM64 t4g.small (2 vCPU, 2 GiB RAM)"
  type        = string
  default     = "t4g.small"
}

variable "ami_id" {
  description = "Specific AMI ID. If empty, the latest Amazon Linux 2023 ARM64 AMI is automatically resolved"
  type        = string
  default     = ""
}

variable "subnet_ids" {
  description = "Subnet IDs for the Auto Scaling Group"
  type        = list(string)
}

variable "target_group_arns" {
  description = "List of ALB target group ARNs to register instances with"
  type        = list(string)
}

variable "security_group_ids" {
  description = "List of Security Group IDs for Application instances"
  type        = list(string)
}

variable "iam_instance_profile_name" {
  description = "Name of the IAM instance profile to attach"
  type        = string
}

variable "min_size" {
  description = "Minimum number of application instances"
  type        = number
  default     = 1
}

variable "desired_capacity" {
  description = "Desired number of application instances"
  type        = number
  default     = 1
}

variable "max_size" {
  description = "Maximum number of application instances"
  type        = number
  default     = 2
}

variable "cpu_target_utilization" {
  description = "Target average CPU utilization percentage for target tracking scaling policy"
  type        = number
  default     = 65.0
}

variable "root_volume_size" {
  description = "Size of the root gp3 EBS volume in GiB"
  type        = number
  default     = 30
}

variable "user_data_base64" {
  description = "Base64-encoded user data script to initialize the instances"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
