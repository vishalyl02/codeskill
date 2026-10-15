variable "aws_region" {
  type    = string
  default = "ap-south-1"
}
variable "name_prefix" {
  type    = string
  default = "codeskill-shared-judges"
}
variable "deployment_mode" {
  description = "Separate: one same-type machine per judge. Shared remains available for an existing budget deployment."
  type        = string
  default     = "separate"
  validation {
    condition     = contains(["shared", "separate"], var.deployment_mode)
    error_message = "Use shared or separate."
  }
}
variable "existing_vpc_id" { type = string }
variable "existing_private_subnet_id" { type = string }
variable "backend_security_group_ids" { type = set(string) }
variable "judge_instance_type" {
  type    = string
  default = "t4g.small"
}
variable "runtime_architecture" {
  description = "Architecture for the native source build; stock AMD64 judge images are not used."
  type        = string
  default     = "arm64"
  validation {
    condition     = contains(["x86_64", "arm64"], var.runtime_architecture)
    error_message = "Runtime architecture must be x86_64 or arm64."
  }
}
variable "judge_ami_id" {
  type    = string
  default = ""
}
variable "root_volume_size" {
  type    = number
  default = 40
}
variable "require_free_plan_eligibility" {
  type    = bool
  default = true
}
variable "runtime_bundle_bucket" { type = string }
variable "runtime_bundle_key" { type = string }
variable "runtime_bundle_sha256" {
  type = string
  validation {
    condition     = can(regex("^[a-f0-9]{64}$", var.runtime_bundle_sha256))
    error_message = "Provide the SHA-256 of the tested runtime bundle."
  }
}
variable "tags" {
  type    = map(string)
  default = { Project = "CodeSkill", Scope = "judges-only" }
}
