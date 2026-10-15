# =================================================================================================
# CodeSkill AWS Infrastructure - Production Terraform Root Module
# =================================================================================================

# 1. Networking (VPC, Dual AZs, Public/Private Subnets, Free S3 Endpoint, Toggleable NAT)
module "networking" {
  source = "./modules/networking"

  name_prefix            = local.name_prefix
  vpc_cidr               = var.vpc_cidr
  azs                    = var.azs
  public_subnets         = var.public_subnets
  private_app_subnets    = var.private_app_subnets
  private_db_subnets     = var.private_db_subnets
  private_judge0_subnets = var.private_judge0_subnets
  enable_nat_gateway     = local.enable_nat_gateway
  tags                   = local.common_tags
}

# 2. Security Groups (Least-privilege isolation: ALB -> App -> RDS / Judge0)
module "security" {
  source = "./modules/security"

  name_prefix             = local.name_prefix
  vpc_id                  = module.networking.vpc_id
  allowed_ssh_cidr_blocks = var.allowed_ssh_cidr_blocks
  tags                    = local.common_tags
}

# 3. Application Load Balancer (Public, HTTP->HTTPS redirect, ACM TLS, Health Checks)
module "alb" {
  source = "./modules/alb"

  name_prefix                = local.name_prefix
  vpc_id                     = module.networking.vpc_id
  public_subnet_ids          = module.networking.public_subnet_ids
  security_group_id          = module.security.alb_security_group_id
  certificate_arn            = var.certificate_arn
  health_check_path          = var.health_check_path
  deregistration_delay       = 30
  idle_timeout               = 300
  enable_deletion_protection = var.environment == "production"
  tags                       = local.common_tags
}

# 4. IAM Roles & Instance Profiles (SSM Session Manager, Secrets Manager, S3)
module "iam" {
  source = "./modules/iam"

  name_prefix = local.name_prefix
  tags        = local.common_tags
}

# 5. Amazon RDS PostgreSQL (db.t4g.micro, Private, gp3, Parameter Group tuned for 1 GiB RAM)
module "rds" {
  source = "./modules/rds"

  name_prefix             = local.name_prefix
  instance_class          = var.db_instance_class
  allocated_storage       = var.db_allocated_storage
  max_allocated_storage   = var.db_max_allocated_storage
  db_name                 = var.db_name
  db_username             = var.db_username
  db_password             = var.db_password
  multi_az                = var.db_multi_az
  db_subnet_group_name    = module.networking.db_subnet_group_name
  security_group_ids      = [module.security.rds_security_group_id]
  backup_retention_period = var.db_backup_retention_period
  deletion_protection     = var.db_deletion_protection
  skip_final_snapshot     = var.db_skip_final_snapshot
  tags                    = local.common_tags
}

# 6. User Data Script Rendering
locals {
  app_userdata = templatefile("${path.module}/userdata/app.sh.tftpl", {
    aws_region      = var.aws_region
    db_secret_arn   = module.rds.secret_arn
    db_endpoint     = module.rds.endpoint
    db_username     = module.rds.db_username
    db_password     = ""
    db_name         = module.rds.db_name
    redis_host      = "127.0.0.1" # Local or cluster Redis
    redis_port      = "6379"
    jwt_secret      = var.jwt_secret
    judge0_url      = "http://judge0.internal:2358"
    monitoring_host = var.monitoring_host
    s3_bucket_name  = "codeskill-prod-files-reports"
    app_public_url  = "https://${var.domain_name}"
    git_repo_url    = var.git_repo_url
    git_branch      = var.git_branch
  })

  judge0_userdata = templatefile("${path.module}/userdata/judge0.sh.tftpl", {
    cpu_time_limit         = var.judge0_cpu_time_limit
    max_cpu_time_limit     = var.judge0_max_cpu_time_limit
    memory_limit_kb        = var.judge0_memory_limit_kb
    max_memory_limit_kb    = tostring(tonumber(var.judge0_memory_limit_kb) * 2)
    max_processes          = var.judge0_max_processes
    workers_count          = 2
    judge0_db_password     = var.judge0_db_password
    judge0_redis_password  = var.judge0_redis_password
    db_secret_arn          = module.rds.secret_arn
    aws_region             = var.aws_region
    db_endpoint            = module.rds.endpoint
    db_username            = module.rds.db_username
    db_password            = ""
    db_name                = module.rds.db_name
    loki_retention_period  = var.loki_retention_period
    grafana_admin_password = var.grafana_admin_password
  })
}

# 7. Application Auto Scaling Group (Shared Next.js + NestJS, ARM64 t4g.small)
module "application_asg" {
  source = "./modules/application-asg"

  name_prefix               = local.name_prefix
  instance_type             = var.app_instance_type
  ami_id                    = var.app_ami_id
  subnet_ids                = local.app_subnet_ids
  target_group_arns         = [module.alb.target_group_arn]
  security_group_ids        = [module.security.app_security_group_id]
  iam_instance_profile_name = module.iam.app_instance_profile_name
  min_size                  = local.app_min_size
  desired_capacity          = local.app_desired_capacity
  max_size                  = local.app_max_size
  cpu_target_utilization    = var.app_cpu_target_utilization
  root_volume_size          = var.app_root_volume_size
  user_data_base64          = base64encode(local.app_userdata)
  tags                      = local.common_tags
}

# 8. Judge0 Execution Infrastructure (x86_64 m7i-flex.large, sandboxed execution)
module "judge0" {
  source = "./modules/judge0"

  name_prefix                       = local.name_prefix
  instance_type                     = var.judge0_instance_type
  ami_id                            = var.judge0_ami_id
  subnet_ids                        = local.judge0_subnet_ids
  security_group_ids                = [module.security.judge0_security_group_id]
  iam_instance_profile_name         = module.iam.judge0_instance_profile_name
  min_size                          = var.judge0_min_size
  desired_capacity                  = var.judge0_desired_capacity
  max_size                          = var.judge0_max_size
  root_volume_size                  = var.judge0_root_volume_size
  user_data_base64                  = base64encode(local.judge0_userdata)
  judge0_worker_autoscaling_enabled = var.judge0_worker_autoscaling_enabled
  judge0_worker_min_size            = var.judge0_worker_min_size
  judge0_worker_max_size            = var.judge0_worker_max_size
  tags                              = local.common_tags
}

# 9. Open-Source Monitoring Suite (Prometheus, Grafana OSS, Loki, Promtail, Uptime Kuma)
module "monitoring" {
  source = "./modules/monitoring"

  name_prefix            = local.name_prefix
  loki_retention_period  = var.loki_retention_period
  grafana_admin_password = var.grafana_admin_password
  alert_email            = var.alert_email
  tags                   = local.common_tags
}

# 10. AWS Cost Controls & AWS Budgets (Threshold notifications at $25, $50, $75, $90)
module "cost_controls" {
  source = "./modules/cost-controls"

  name_prefix           = local.name_prefix
  monthly_budget_amount = var.monthly_budget_amount
  notification_emails   = var.alert_email != "" ? [var.alert_email] : []
  tags                  = local.common_tags
}
