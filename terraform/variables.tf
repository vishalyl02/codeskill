# -------------------------------------------------------------------------------------------------
# General & Environment Variables
# -------------------------------------------------------------------------------------------------
variable "aws_region" {
  description = "AWS region to deploy infrastructure"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Deployment environment name (e.g. production, staging, dev)"
  type        = string
  default     = "production"
}

variable "profile" {
  description = "Operating cost profile: 'budget' (minimal baseline: 1 app, 1 judge0, 1 micro db, no NAT gateway) or 'exam' (scale-out enabled for high concurrency)"
  type        = string
  default     = "budget"

  validation {
    condition     = contains(["budget", "exam"], var.profile)
    error_message = "Profile must be either 'budget' or 'exam'."
  }
}

variable "tags" {
  description = "Custom resource tags"
  type        = map(string)
  default     = {}
}

# -------------------------------------------------------------------------------------------------
# Networking Variables
# -------------------------------------------------------------------------------------------------
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "azs" {
  description = "List of Availability Zones in region (minimum 2)"
  type        = list(string)
  default     = ["ap-south-1a", "ap-south-1b"]
}

variable "public_subnets" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_app_subnets" {
  description = "CIDR blocks for private application subnets"
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24"]
}

variable "private_db_subnets" {
  description = "CIDR blocks for private database subnets"
  type        = list(string)
  default     = ["10.0.21.0/24", "10.0.22.0/24"]
}

variable "private_judge0_subnets" {
  description = "CIDR blocks for private Judge0 subnets"
  type        = list(string)
  default     = ["10.0.31.0/24", "10.0.32.0/24"]
}

variable "enable_nat_gateway" {
  description = "Explicitly enable/disable NAT Gateway. If null, automatically determined by profile (budget = false, exam = true)."
  type        = bool
  default     = null
}

variable "allowed_ssh_cidr_blocks" {
  description = "Optional list of CIDRs allowed direct SSH. Kept empty by default; administration is done via AWS Systems Manager Session Manager."
  type        = list(string)
  default     = []
}

# -------------------------------------------------------------------------------------------------
# Application Load Balancer & DNS
# -------------------------------------------------------------------------------------------------
variable "domain_name" {
  description = "Production platform domain name"
  type        = string
  default     = "codeskill.novaserve.cloud"
}

variable "certificate_arn" {
  description = "ACM Certificate ARN for HTTPS listener. E.g. arn:aws:acm:ap-south-1:239939507154:certificate/29148a30-541b-4859-82ee-a8f8eda07ed8"
  type        = string
  default     = ""
}

variable "health_check_path" {
  description = "Health check path for application target group"
  type        = string
  default     = "/healthz"
}

# -------------------------------------------------------------------------------------------------
# Application ASG (Next.js + NestJS Shared Host)
# -------------------------------------------------------------------------------------------------
variable "app_instance_type" {
  description = "Instance type for application host. Defaults to ARM64 t4g.small (2 vCPU, 2 GiB RAM)"
  type        = string
  default     = "t4g.small"
}

variable "app_ami_id" {
  description = "Specific AMI ID for application. If empty, latest Amazon Linux 2023 ARM64 is used."
  type        = string
  default     = ""
}

variable "app_min_size" {
  description = "Minimum application instances in ASG"
  type        = number
  default     = 1
}

variable "app_desired_capacity" {
  description = "Desired application instances in ASG. If null, profile default is used."
  type        = number
  default     = null
}

variable "app_max_size" {
  description = "Maximum application instances in ASG. If null, profile default is used."
  type        = number
  default     = null
}

variable "app_cpu_target_utilization" {
  description = "Target average CPU utilization percentage for application autoscaling"
  type        = number
  default     = 65.0
}

variable "app_root_volume_size" {
  description = "EBS gp3 root volume size in GiB for application instances"
  type        = number
  default     = 30
}

variable "git_repo_url" {
  description = "Git repository URL for automatic application deployment"
  type        = string
  default     = ""
}

variable "git_branch" {
  description = "Git branch to check out"
  type        = string
  default     = "main"
}

variable "jwt_secret" {
  description = "JWT Secret for application authentication"
  type        = string
  default     = "codeskill-prod-secret-change-me"
  sensitive   = true
}

# -------------------------------------------------------------------------------------------------
# Judge0 Execution Host & Sandboxing
# -------------------------------------------------------------------------------------------------
variable "judge0_instance_type" {
  description = "Instance type for primary Judge0 host (x86_64 m7i-flex.large has 2 vCPU, 8 GiB RAM)"
  type        = string
  default     = "m7i-flex.large"
}

variable "judge0_ami_id" {
  description = "Specific AMI ID for Judge0. If empty, latest Amazon Linux 2023 x86_64 is used."
  type        = string
  default     = ""
}

variable "judge0_min_size" {
  description = "Minimum primary Judge0 instances"
  type        = number
  default     = 1
}

variable "judge0_desired_capacity" {
  description = "Desired primary Judge0 instances"
  type        = number
  default     = 1
}

variable "judge0_max_size" {
  description = "Maximum primary Judge0 instances"
  type        = number
  default     = 1
}

variable "judge0_root_volume_size" {
  description = "EBS gp3 root volume size in GiB for Judge0 host"
  type        = number
  default     = 40
}

variable "judge0_cpu_time_limit" {
  description = "Default CPU execution time limit in seconds for student submissions"
  type        = string
  default     = "2.0"
}

variable "judge0_max_cpu_time_limit" {
  description = "Hard upper CPU execution time limit in seconds"
  type        = string
  default     = "10.0"
}

variable "judge0_memory_limit_kb" {
  description = "Default memory limit in KB for student submissions (512 MB = 524288)"
  type        = string
  default     = "524288"
}

variable "judge0_max_processes" {
  description = "Maximum processes / threads per submission sandbox"
  type        = string
  default     = "60"
}

variable "judge0_db_password" {
  description = "Internal database password for Judge0 container database"
  type        = string
  default     = "Judge0InternalDbSecret!2024"
  sensitive   = true
}

variable "judge0_redis_password" {
  description = "Internal Redis password for Judge0 container queue"
  type        = string
  default     = "Judge0InternalRedisSecret!2024"
  sensitive   = true
}

# Future Judge0 Worker Auto Scaling variables
variable "judge0_worker_autoscaling_enabled" {
  description = "Enable separate Judge0 worker Auto Scaling fleet (kept FALSE until shared queue is configured)"
  type        = bool
  default     = false
}

variable "judge0_worker_min_size" {
  description = "Minimum Judge0 worker nodes when worker autoscaling is enabled"
  type        = number
  default     = 1
}

variable "judge0_worker_max_size" {
  description = "Maximum Judge0 worker nodes when worker autoscaling is enabled"
  type        = number
  default     = 3
}

# -------------------------------------------------------------------------------------------------
# Amazon RDS PostgreSQL
# -------------------------------------------------------------------------------------------------
variable "db_instance_class" {
  description = "Database instance class. db.t4g.micro is ARM-based with 2 vCPU and 1 GiB RAM."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "Allocated storage in GiB for PostgreSQL RDS"
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Storage auto-scaling upper limit in GiB"
  type        = number
  default     = 50
}

variable "db_name" {
  description = "PostgreSQL default database name"
  type        = string
  default     = "codeskill"
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "codeskill_admin"
}

variable "db_password" {
  description = "Master password for RDS. Auto-generated and stored in Secrets Manager if empty."
  type        = string
  default     = ""
  sensitive   = true
}

variable "db_multi_az" {
  description = "Enable multi-AZ deployment for RDS. False in budget profile to save 100% replica cost."
  type        = bool
  default     = false
}

variable "db_deletion_protection" {
  description = "Prevent accidental RDS deletion via Terraform apply/destroy"
  type        = bool
  default     = true
}

variable "db_skip_final_snapshot" {
  description = "Skip final snapshot upon RDS destruction"
  type        = bool
  default     = false
}

variable "db_backup_retention_period" {
  description = "Days of automated backups to retain"
  type        = number
  default     = 7
}

# -------------------------------------------------------------------------------------------------
# Open-Source Monitoring & Cost Controls (Prometheus, Grafana OSS, Loki, Uptime Kuma)
# -------------------------------------------------------------------------------------------------
variable "loki_retention_period" {
  description = "Log retention period for Loki centralized log aggregator (e.g., '168h' for 7 days)"
  type        = string
  default     = "168h"
}

variable "grafana_admin_password" {
  description = "Administrator password for Grafana OSS monitoring portal"
  type        = string
  default     = "CodeSkillGrafana2024!"
  sensitive   = true
}

variable "monitoring_host" {
  description = "Internal IP address or hostname of the host running Prometheus & Loki"
  type        = string
  default     = "127.0.0.1"
}

variable "alert_email" {
  description = "Email address to receive AWS Budgets and platform incident alerts"
  type        = string
  default     = ""
}

variable "monthly_budget_amount" {
  description = "Monthly spending budget limit in USD"
  type        = string
  default     = "100"
}
