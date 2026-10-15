# Separate state and root: only the judge hosts and their own SG/IAM
# resources are managed here. Existing production resources are data lookups.
module "shared_judges" {
  source = "../../modules/shared-judges"

  name_prefix                   = var.name_prefix
  enabled_providers             = var.deployment_mode == "separate" ? ["judge0"] : ["judge0", "piston"]
  vpc_id                        = var.existing_vpc_id
  subnet_id                     = var.existing_private_subnet_id
  backend_security_group_ids    = var.backend_security_group_ids
  instance_type                 = var.judge_instance_type
  runtime_architecture          = var.runtime_architecture
  ami_id                        = var.judge_ami_id
  root_volume_size              = var.root_volume_size
  require_free_plan_eligibility = var.require_free_plan_eligibility
  runtime_bundle_bucket         = var.runtime_bundle_bucket
  runtime_bundle_key            = var.runtime_bundle_key
  runtime_bundle_sha256         = var.runtime_bundle_sha256
  tags                          = var.tags
}

# Keep the original module address and EC2 for Judge0; add one Piston host.
module "piston" {
  count  = var.deployment_mode == "separate" ? 1 : 0
  source = "../../modules/shared-judges"

  name_prefix                   = "${var.name_prefix}-piston"
  enabled_providers             = ["piston"]
  vpc_id                        = var.existing_vpc_id
  subnet_id                     = var.existing_private_subnet_id
  backend_security_group_ids    = var.backend_security_group_ids
  instance_type                 = var.judge_instance_type
  runtime_architecture          = var.runtime_architecture
  ami_id                        = var.judge_ami_id
  root_volume_size              = var.root_volume_size
  require_free_plan_eligibility = var.require_free_plan_eligibility
  runtime_bundle_bucket         = var.runtime_bundle_bucket
  runtime_bundle_key            = var.runtime_bundle_key
  runtime_bundle_sha256         = var.runtime_bundle_sha256
  tags                          = merge(var.tags, { Provider = "piston" })
}
