variable "name_prefix" {
  description = "Prefix to apply to all resource names"
  type        = string
  default     = "codeskill"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "azs" {
  description = "Availability Zones to use (minimum 2 required for ALB and RDS)"
  type        = list(string)
  default     = ["ap-south-1a", "ap-south-1b"]
}

variable "public_subnets" {
  description = "CIDR blocks for public subnets (ALB & bastion if needed)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_app_subnets" {
  description = "CIDR blocks for private application subnets"
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24"]
}

variable "private_db_subnets" {
  description = "CIDR blocks for private database subnets (no outbound internet)"
  type        = list(string)
  default     = ["10.0.21.0/24", "10.0.22.0/24"]
}

variable "private_judge0_subnets" {
  description = "CIDR blocks for private Judge0 execution subnets"
  type        = list(string)
  default     = ["10.0.31.0/24", "10.0.32.0/24"]
}

variable "enable_nat_gateway" {
  description = "Set to true to provision a NAT Gateway for private subnets. Set to false in Budget profile to eliminate ~$33/mo NAT charge."
  type        = bool
  default     = false
}

variable "single_nat_gateway" {
  description = "Use a single NAT Gateway across all AZs to minimize cost when NAT is enabled"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
