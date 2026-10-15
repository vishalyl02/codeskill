terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
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
  name_prefix = "codeskill-prod"
  domain_name = "codeskill.local" # Replace with actual production domain
}

module "vpc" {
  source              = "../../modules/vpc"
  name_prefix         = local.name_prefix
  vpc_cidr            = var.vpc_cidr
  azs                 = var.azs
  public_subnets      = var.public_subnets
  private_app_subnets = var.private_app_subnets
  private_db_subnets  = var.private_db_subnets
}

resource "aws_security_group" "alb" {
  name   = "${local.name_prefix}-alb-sg"
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

module "alb" {
  source            = "../../modules/alb"
  name_prefix       = local.name_prefix
  vpc_id            = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids
  security_group_id = aws_security_group.alb.id
  certificate_arn   = "arn:aws:acm:ap-south-1:239939507154:certificate/29148a30-541b-4859-82ee-a8f8eda07ed8"
}

# module "waf" {
#   source      = "../../modules/waf"
#   name_prefix = local.name_prefix
#   alb_arn     = module.alb.alb_arn
# }

module "s3" {
  source      = "../../modules/s3"
  name_prefix = local.name_prefix
}

module "iam" {
  source        = "../../modules/iam"
  name_prefix   = local.name_prefix
  s3_bucket_arn = module.s3.bucket_arn
}

module "ec2" {
  source                = "../../modules/ec2"
  name_prefix           = local.name_prefix
  vpc_id                = module.vpc.vpc_id
  alb_security_group_id = aws_security_group.alb.id
}

module "asg" {
  source                    = "../../modules/asg"
  name_prefix               = local.name_prefix
  private_app_subnet_ids    = module.vpc.private_app_subnet_ids
  target_group_arn          = module.alb.target_group_arn
  app_security_group_id     = module.ec2.app_security_group_id
  instance_type             = "t3.micro"
  min_size                  = 1
  max_size                  = 2
  desired_capacity          = 1
  ami_id                    = var.ami_id
  iam_instance_profile_name = module.iam.instance_profile_name
  db_endpoint               = module.rds.endpoint
  db_name                   = var.db_name
  db_username               = var.db_username
  db_password               = var.db_password
  redis_endpoint            = module.redis.endpoint
}

module "rds" {
  source                = "../../modules/rds"
  name_prefix           = local.name_prefix
  vpc_id                = module.vpc.vpc_id
  private_db_subnet_ids = module.vpc.private_db_subnet_ids
  app_security_group_id = module.ec2.app_security_group_id
  db_name               = var.db_name
  db_username           = var.db_username
  db_password           = var.db_password
  instance_class        = "db.t3.micro"
  allocated_storage     = 20
  multi_az              = false
}

module "redis" {
  source                = "../../modules/redis"
  name_prefix           = local.name_prefix
  vpc_id                = module.vpc.vpc_id
  private_db_subnet_ids = module.vpc.private_db_subnet_ids
  app_security_group_id = module.ec2.app_security_group_id
  node_type             = "cache.t4g.micro"
}

# module "route53" {
#   source       = "../../modules/route53"
#   domain_name  = local.domain_name
#   alb_dns_name = module.alb.alb_dns_name
#   alb_zone_id  = module.alb.alb_zone_id
# }

module "monitoring" {
  source           = "../../modules/monitoring"
  name_prefix      = local.name_prefix
  asg_name         = module.asg.asg_name
  db_identifier    = module.rds.db_identifier
  redis_cluster_id = module.redis.redis_cluster_id
  aws_region       = var.aws_region
}
