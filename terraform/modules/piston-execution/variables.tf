variable "name_prefix" { type = string }
variable "vpc_id" { type = string }
variable "isolated_subnet_id" {
  type        = string
  description = "Dedicated subnet without routes to the internet, database, Redis or metadata; preload reviewed artifacts offline"
}
variable "audited_linux_ami_id" {
  type        = string
  description = "Audited Linux cgroup-v2 image with Docker/Isolate prerequisites and execution-only nginx proxy installed"
}
variable "trusted_backend_security_group_ids" { type = list(string) }
variable "maintenance_security_group_ids" {
  type    = list(string)
  default = []
}
variable "maintenance_key_name" {
  type    = string
  default = null
}
variable "instance_type" {
  type    = string
  default = "c6i.xlarge"
}
