variable "name_prefix" {
  type    = string
  default = "codeskill"
}

variable "bucket_name" {
  description = "Custom S3 bucket name. If empty, defaults to name_prefix-files-reports."
  type        = string
  default     = ""
}

variable "enable_public_avatars" {
  description = "Whether to attach a public read policy for /avatars/* in the bucket. Set to false if AWS account-level Block Public Access prevents public policies."
  type        = bool
  default     = false
}
