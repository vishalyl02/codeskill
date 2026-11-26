terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "CodeSkill"
      Environment = "production"
      ManagedBy   = "Terraform"
    }
  }
}

locals {
  name_prefix  = "codeskill-prod"
  domain_name  = var.domain_name
  account_id   = "239939507154"
  ecr_registry = "${local.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
}

# -----------------------------------------------------------------------------
# 1. Networking (VPC & Subnets)
# -----------------------------------------------------------------------------
module "vpc" {
  source              = "../../modules/vpc"
  name_prefix         = local.name_prefix
  vpc_cidr            = var.vpc_cidr
  azs                 = var.azs
  public_subnets      = var.public_subnets
  private_app_subnets = var.private_app_subnets
  private_db_subnets  = var.private_db_subnets
}

# -----------------------------------------------------------------------------
# 2. Container Registry (Amazon ECR for Immutable Docker Images)
# -----------------------------------------------------------------------------
module "ecr" {
  source      = "../../modules/ecr"
  name_prefix = local.name_prefix
}

# -----------------------------------------------------------------------------
# 3. Private Service Discovery (Cloud Map for Execution Engines)
# -----------------------------------------------------------------------------
module "service_discovery" {
  source         = "../../modules/service-discovery"
  namespace_name = "codeskill.internal"
  vpc_id         = module.vpc.vpc_id
}

# -----------------------------------------------------------------------------
# 4. Security Groups (Strict Principle of Least Privilege)
# -----------------------------------------------------------------------------
# A. ALB Security Group (Preserved in Terraform State)
resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb-sg"
  description = "Managed by Terraform"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "Public HTTP redirect"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Public HTTPS traffic"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Outbound traffic to target groups"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-alb-sg"
  }
}

# B. Frontend Security Group (Port 3000 from ALB)
resource "aws_security_group" "frontend" {
  name        = "${local.name_prefix}-frontend-sg"
  description = "Allows HTTP port 3000 strictly from ALB"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "Next.js port 3000 from ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-frontend-sg"
    Tier = "frontend"
  }
}

# C. Backend Security Group (Port 5001 from ALB + internal ingress)
resource "aws_security_group" "backend" {
  name        = "${local.name_prefix}-backend-sg"
  description = "Allows API port 5001 from ALB and internal frontend"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "NestJS API port 5001 from ALB"
    from_port       = 5001
    to_port         = 5001
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description     = "NestJS API from frontend instances (for server-side calls)"
    from_port       = 5001
    to_port         = 5001
    protocol        = "tcp"
    security_groups = [aws_security_group.frontend.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-backend-sg"
    Tier = "backend"
  }
}

# D. Piston Execution Host Security Group (Port 2001 private from backend only)
resource "aws_security_group" "piston" {
  name        = "${local.name_prefix}-piston-sg"
  description = "Private Piston API strictly accessible from backend"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "Piston API from backend instances"
    from_port       = 2001
    to_port         = 2001
    protocol        = "tcp"
    security_groups = [aws_security_group.backend.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-piston-sg"
    Tier = "piston"
  }
}

# E. Judge0 Execution Host Security Group (Port 2358 private from backend only)
resource "aws_security_group" "judge0" {
  name        = "${local.name_prefix}-judge0-sg"
  description = "Private Judge0 API strictly accessible from backend"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "Judge0 API from backend instances"
    from_port       = 2358
    to_port         = 2358
    protocol        = "tcp"
    security_groups = [aws_security_group.backend.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-judge0-sg"
    Tier = "judge0"
  }
}

# F. RDS PostgreSQL Security Group
resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds-sg"
  description = "Allow PostgreSQL 5432 from backend application"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "PostgreSQL from backend"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.backend.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-rds-sg"
  }
}

# -----------------------------------------------------------------------------
# 5. Application Load Balancer & WAF
# -----------------------------------------------------------------------------
module "alb" {
  source                     = "../../modules/alb"
  name_prefix                = local.name_prefix
  vpc_id                     = module.vpc.vpc_id
  public_subnet_ids          = module.vpc.public_subnet_ids
  security_group_id          = aws_security_group.alb.id
  certificate_arn            = var.certificate_arn
  frontend_health_check_path = "/health/ready"
  backend_health_check_path  = "/api/health/ready"
  target_group_name          = "${local.name_prefix}-tg"
  backend_stickiness_enabled = false
}

module "waf" {
  source      = "../../modules/waf"
  name_prefix = local.name_prefix
  alb_arn     = module.alb.alb_arn
}

# -----------------------------------------------------------------------------
# 6. Storage (S3) & IAM Role Definitions
# -----------------------------------------------------------------------------
module "s3" {
  source                = "../../modules/s3"
  name_prefix           = local.name_prefix
  enable_public_avatars = true
}

module "iam" {
  source                = "../../modules/iam"
  name_prefix           = local.name_prefix
  enable_s3             = true
  s3_bucket_arn         = module.s3.bucket_arn
  pm2_io_parameter_name = var.pm2_io_parameter_name
  db_secret_arn         = module.rds.secret_arn
}

# -----------------------------------------------------------------------------
# 7. Database & Caching Services (Private RDS PostgreSQL & ElastiCache Redis)
# -----------------------------------------------------------------------------
module "rds" {
  source                  = "../../modules/rds"
  name_prefix             = local.name_prefix
  vpc_id                  = module.vpc.vpc_id
  private_db_subnet_ids   = module.vpc.private_db_subnet_ids
  security_group_ids      = [aws_security_group.rds.id]
  db_name                 = var.db_name
  db_username             = var.db_username
  db_password             = var.db_password
  instance_class          = "db.t3.micro"
  allocated_storage       = 20
  max_allocated_storage   = 500
  multi_az                = false
  backup_retention_period = 0
  storage_encrypted       = false
  deletion_protection     = true
}

module "redis" {
  source                        = "../../modules/redis"
  name_prefix                   = local.name_prefix
  vpc_id                        = module.vpc.vpc_id
  private_db_subnet_ids         = module.vpc.private_db_subnet_ids
  authorized_security_group_ids = [aws_security_group.backend.id]
  node_type                     = "cache.t4g.micro"
  transit_encryption_enabled    = false
  at_rest_encryption_enabled    = false
}

# -----------------------------------------------------------------------------
# 8. Four Independent EC2 Auto Scaling Groups
# -----------------------------------------------------------------------------

# --- ASG 1: Frontend (Next.js SSR + Client) ---
module "frontend_asg" {
  source             = "../../modules/ec2-asg"
  asg_name           = "codeskill-frontend-asg"
  service_tier       = "frontend"
  ami_id             = var.ami_id
  instance_type      = var.frontend_instance_type
  security_group_ids = [aws_security_group.frontend.id]
  subnet_ids         = module.vpc.private_app_subnet_ids
  target_group_arns  = [module.alb.frontend_target_group_arn]

  iam_instance_profile_name = module.iam.frontend_instance_profile_name

  min_size         = 1
  desired_capacity = 1
  max_size         = 4

  cpu_target_utilization = 65.0

  health_check_type         = "ELB"
  health_check_grace_period = 300
  min_healthy_percentage    = 0
  instance_warmup           = var.asg_instance_warmup

  user_data = templatefile("${path.module}/userdata/frontend.sh.tftpl", {
    aws_region            = var.aws_region
    ecr_registry          = local.ecr_registry
    pm2_io_parameter_name = var.pm2_io_parameter_name
    frontend_image        = "${module.ecr.frontend_repository_url}:${var.frontend_image_tag}"
    domain_name           = local.domain_name
    internal_backend_url  = module.service_discovery.backend_base_url
  })

  scheduled_exam_scale_up_cron   = var.exam_scale_up_cron
  scheduled_exam_scale_down_cron = var.exam_scale_down_cron
}

# --- ASG 2: Backend (NestJS API + BullMQ Worker) ---
module "backend_asg" {
  source             = "../../modules/ec2-asg"
  asg_name           = "codeskill-backend-asg"
  service_tier       = "backend"
  ami_id             = var.ami_id
  instance_type      = var.backend_instance_type
  security_group_ids = [aws_security_group.backend.id]
  subnet_ids         = module.vpc.private_app_subnet_ids
  target_group_arns  = [module.alb.backend_target_group_arn]

  iam_instance_profile_name = module.iam.backend_instance_profile_name

  min_size         = 1
  desired_capacity = 1
  max_size         = 4

  cpu_target_utilization = 60.0

  health_check_type         = "ELB"
  health_check_grace_period = 300
  min_healthy_percentage    = 0
  instance_warmup           = var.asg_instance_warmup

  user_data = templatefile("${path.module}/userdata/backend.sh.tftpl", {
    aws_region                 = var.aws_region
    ecr_registry               = local.ecr_registry
    pm2_io_parameter_name      = var.pm2_io_parameter_name
    backend_image              = "${module.ecr.backend_repository_url}:${var.backend_image_tag}"
    domain_name                = local.domain_name
    db_secret_arn              = module.rds.secret_arn
    db_host                    = split(":", module.rds.endpoint)[0]
    db_username                = var.db_username
    db_name                    = var.db_name
    redis_host                 = module.redis.endpoint
    redis_cluster_mode         = "true"
    redis_tls                  = "false"
    backend_env_parameter_name = var.backend_env_parameter_name
    backend_service_id         = module.service_discovery.backend_service_id
    piston_base_url            = module.service_discovery.piston_base_url
    judge0_base_url            = module.service_discovery.judge0_base_url
    s3_bucket_name             = module.s3.bucket_name
  })

  scheduled_exam_scale_up_cron   = var.exam_scale_up_cron
  scheduled_exam_scale_down_cron = var.exam_scale_down_cron
}

# --- ASG 3: Piston (Isolated Code Execution Node) ---
module "piston_asg" {
  source             = "../../modules/ec2-asg"
  asg_name           = "codeskill-piston-asg"
  service_tier       = "piston"
  ami_id             = var.ami_id
  instance_type      = var.piston_instance_type
  security_group_ids = [aws_security_group.piston.id]
  subnet_ids         = module.vpc.private_app_subnet_ids
  target_group_arns  = []

  iam_instance_profile_name = module.iam.piston_instance_profile_name

  min_size         = 1
  desired_capacity = 1
  max_size         = 4

  cpu_target_utilization = 60.0

  health_check_type         = "EC2"
  health_check_grace_period = 300
  min_healthy_percentage    = 0
  instance_warmup           = 180

  user_data = templatefile("${path.module}/userdata/piston.sh.tftpl", {
    aws_region        = var.aws_region
    ecr_registry      = local.ecr_registry
    piston_image      = "ghcr.io/engineer-man/piston:latest"
    piston_service_id = module.service_discovery.piston_service_id
  })

  scheduled_exam_scale_up_cron   = var.exam_scale_up_cron
  scheduled_exam_scale_down_cron = var.exam_scale_down_cron
}

# --- ASG 4: Judge0 (Isolated Code Judging Node) ---
module "judge0_asg" {
  source             = "../../modules/ec2-asg"
  asg_name           = "codeskill-judge0-asg"
  service_tier       = "judge0"
  ami_id             = var.ami_id
  instance_type      = var.judge0_instance_type
  security_group_ids = [aws_security_group.judge0.id]
  subnet_ids         = module.vpc.private_app_subnet_ids
  target_group_arns  = []

  iam_instance_profile_name = module.iam.judge0_instance_profile_name

  min_size         = 0
  desired_capacity = 0
  max_size         = 2

  cpu_target_utilization = 65.0

  health_check_type         = "EC2"
  health_check_grace_period = 180
  min_healthy_percentage    = 0
  instance_warmup           = 180

  user_data = templatefile("${path.module}/userdata/judge0.sh.tftpl", {
    aws_region        = var.aws_region
    ecr_registry      = local.ecr_registry
    judge0_image      = "${module.ecr.judge0_repository_url}:${var.judge0_image_tag}"
    judge0_service_id = module.service_discovery.judge0_service_id
  })

  scheduled_exam_scale_up_cron   = var.exam_scale_up_cron
  scheduled_exam_scale_down_cron = var.exam_scale_down_cron
}

