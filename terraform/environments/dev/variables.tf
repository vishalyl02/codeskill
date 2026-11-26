variable "aws_region" {
  type    = string
  default = "ap-south-1"
}
variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}
variable "azs" {
  type    = list(string)
  default = ["ap-south-1a", "ap-south-1b"]
}
variable "public_subnets" {
  type    = list(string)
  default = ["10.0.1.0/24", "10.0.2.0/24"]
}
variable "private_app_subnets" {
  type    = list(string)
  default = ["10.0.10.0/24", "10.0.11.0/24"]
}
variable "private_db_subnets" {
  type    = list(string)
  default = ["10.0.20.0/24", "10.0.21.0/24"]
}
variable "ami_id" {
  type    = string
  default = "ami-03054015e26069645" # Valid Amazon Linux 2023 AMI in ap-south-1
}
variable "db_name" {
  type    = string
  default = "codeskill"
}
variable "db_username" {
  type    = string
  default = "postgres"
}
variable "db_password" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Master password for PostgreSQL RDS. Must be at least 8 characters. If left empty, a secure random password will be auto-generated and stored in Secrets Manager."

  validation {
    condition     = var.db_password == "" || length(var.db_password) >= 8
    error_message = "The db_password value must be at least 8 characters long to satisfy AWS RDS password requirements, or left empty to auto-generate."
  }
}
