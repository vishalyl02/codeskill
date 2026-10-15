variable "name_prefix" { type = string }
variable "enabled_providers" {
  type    = set(string)
  default = ["judge0", "piston"]
  validation {
    condition     = length(var.enabled_providers) > 0 && alltrue([for provider in var.enabled_providers : contains(["judge0", "piston"], provider)])
    error_message = "Select judge0, piston, or both."
  }
}
variable "vpc_id" { type = string }
variable "subnet_id" { type = string }
variable "backend_security_group_ids" { type = set(string) }
variable "instance_type" { type = string }
variable "runtime_architecture" { type = string }
variable "ami_id" { type = string }
variable "root_volume_size" { type = number }
variable "require_free_plan_eligibility" { type = bool }
variable "runtime_bundle_bucket" { type = string }
variable "runtime_bundle_key" { type = string }
variable "runtime_bundle_sha256" { type = string }
variable "tags" { type = map(string) }
