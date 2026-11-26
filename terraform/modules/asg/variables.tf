variable "name_prefix" { type = string }
variable "private_app_subnet_ids" { type = list(string) }
variable "target_group_arn" { type = string }
variable "additional_target_group_arns" {
  type    = list(string)
  default = []
}
variable "app_security_group_id" { type = string }
variable "instance_type" { type = string }
variable "min_size" { type = number }
variable "max_size" { type = number }
variable "desired_capacity" { type = number }
variable "ami_id" { type = string }
variable "iam_instance_profile_name" { type = string }
variable "db_endpoint" { type = string }
variable "db_name" { type = string }
variable "db_username" { type = string }
variable "db_password" { type = string }
variable "redis_endpoint" { type = string }


variable "pm2_io_parameter_name" {
  description = "SSM SecureString JSON containing PM2_SECRET_KEY and PM2_PUBLIC_KEY; empty disables PM2.io linking"
  type        = string
  default     = ""
}

variable "s3_bucket_name" {
  description = "S3 bucket name containing releases artifact. If empty, defaults to name_prefix-files-reports."
  type        = string
  default     = ""
}
