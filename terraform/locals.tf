locals {
  name_prefix = "codeskill-${var.environment}"

  is_exam_profile = var.profile == "exam"

  # Profile-aware configurations
  # Budget profile: 1 App EC2 (t4g.small), 1 Judge0 (m7i-flex.large), 1 micro RDS, 1 ALB, No NAT Gateway by default
  # Exam profile: scale-out enabled (up to 4 app nodes, optional NAT gateway, increased operational headroom)
  app_min_size = var.app_min_size
  app_desired_capacity = var.app_desired_capacity != null ? var.app_desired_capacity : (
    local.is_exam_profile ? 2 : 1
  )
  app_max_size = var.app_max_size != null ? var.app_max_size : (
    local.is_exam_profile ? 4 : 2
  )

  enable_nat_gateway = var.enable_nat_gateway != null ? var.enable_nat_gateway : (
    local.is_exam_profile ? true : false
  )

  # Subnet placement:
  # When NAT Gateway is disabled (Budget Profile), Application and Judge0 instances are placed
  # in public subnets with security group isolation to allow outbound internet access for packages/images
  # without incurring the ~$33/mo NAT Gateway hourly charge.
  # When NAT Gateway is enabled (Exam Profile), they are placed strictly in private subnets.
  app_subnet_ids    = local.enable_nat_gateway ? module.networking.private_app_subnet_ids : module.networking.public_subnet_ids
  judge0_subnet_ids = local.enable_nat_gateway ? module.networking.private_judge0_subnet_ids : module.networking.public_subnet_ids

  common_tags = merge(
    var.tags,
    {
      Project     = "CodeSkill"
      Environment = var.environment
      Profile     = var.profile
      ManagedBy   = "Terraform"
    }
  )
}
