variable "name_prefix" {
  description = "Prefix for RDS resources"
  type        = string
  default     = "codeskill"
}

variable "engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "14"
}

variable "parameter_group_name" {
  description = "Name of existing parameter group, or empty to preserve default"
  type        = string
  default     = ""
}

variable "create_parameter_group" {
  description = "Whether to create and attach a custom parameter group"
  type        = bool
  default     = false
}

variable "instance_class" {
  description = "RDS instance class (db.t4g.micro has 2 vCPU, 1 GiB RAM)"
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage" {
  description = "Allocated storage in GiB"
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Maximum storage limit for auto-scaling in GiB"
  type        = number
  default     = 100
}

variable "storage_encrypted" {
  description = "Whether database storage is encrypted. Defaults to false for existing databases to prevent destructive replacement."
  type        = bool
  default     = false
}

variable "performance_insights_enabled" {
  description = "Whether Performance Insights is enabled on the database"
  type        = bool
  default     = true
}

variable "db_name" {
  description = "Name of the default database to create"
  type        = string
  default     = "codeskill"
}

variable "db_username" {
  description = "Master username for PostgreSQL"
  type        = string
  default     = "codeskill_admin"
}

variable "db_password" {
  description = "Master password for PostgreSQL. If left empty, a secure random password will be generated and stored in Secrets Manager."
  type        = string
  default     = ""
  sensitive   = true
}

variable "multi_az" {
  description = "Specifies if the RDS instance is multi-AZ (false for Budget profile to save 100% database replica cost)"
  type        = bool
  default     = false
}

variable "db_subnet_group_name" {
  description = "Name of the DB subnet group"
  type        = string
  default     = ""
}

variable "private_db_subnet_ids" {
  description = "List of private DB subnet IDs (optional for legacy support)"
  type        = list(string)
  default     = []
}

variable "vpc_id" {
  description = "VPC ID (optional for legacy support)"
  type        = string
  default     = ""
}

variable "app_security_group_id" {
  description = "Application security group ID (optional for legacy support)"
  type        = string
  default     = ""
}

variable "security_group_ids" {
  description = "List of VPC security group IDs to assign to RDS"
  type        = list(string)
  default     = []
}

variable "backup_retention_period" {
  description = "Days to retain automated backups"
  type        = number
  default     = 0
}

variable "deletion_protection" {
  description = "Prevent accidental database deletion via Terraform"
  type        = bool
  default     = true
}

variable "skip_final_snapshot" {
  description = "Whether to skip taking a final snapshot before database deletion"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags to apply to RDS resources"
  type        = map(string)
  default     = {}
}
