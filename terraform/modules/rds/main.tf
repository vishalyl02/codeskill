resource "random_password" "db_password" {
  length           = 24
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

locals {
  master_password = var.db_password != "" ? var.db_password : random_password.db_password.result
  major_version   = split(".", var.engine_version)[0]
}

# Optional legacy DB subnet group if not provided directly
resource "aws_db_subnet_group" "main" {
  count       = var.db_subnet_group_name == "" && length(var.private_db_subnet_ids) > 0 ? 1 : 0
  name        = "${var.name_prefix}-db-subnet-group"
  description = "Subnet group for private RDS PostgreSQL instance"
  subnet_ids  = var.private_db_subnet_ids

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-db-subnet-group"
    }
  )
}

# Optional legacy security group if security_group_ids not supplied directly
resource "aws_security_group" "rds" {
  count       = length(var.security_group_ids) == 0 && var.app_security_group_id != "" ? 1 : 0
  name        = "${var.name_prefix}-rds-sg"
  description = "Allow PostgreSQL inbound traffic from app"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-rds-sg"
    }
  )
}

# Parameter group tuned for low-memory instance (db.t4g.micro with 1 GiB RAM)
resource "aws_db_parameter_group" "postgres" {
  count       = var.create_parameter_group ? 1 : 0
  name        = "${var.name_prefix}-pg${local.major_version}-params"
  family      = "postgres${local.major_version}"
  description = "Tuned PostgreSQL parameters for CodeSkill micro database"

  parameter {
    name         = "max_connections"
    value        = "50"
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000" # Log queries taking more than 1 second
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-pg-params"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}


# AWS Secrets Manager Secret for DB Credentials
resource "aws_secretsmanager_secret" "db_credentials" {
  name_prefix             = "${var.name_prefix}-db-secret-"
  description             = "Master credentials for CodeSkill PostgreSQL RDS database"
  recovery_window_in_days = 0

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-db-secret"
    }
  )
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    engine   = "postgres"
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    username = var.db_username
    password = local.master_password
    dbname   = var.db_name
    endpoint = aws_db_instance.main.endpoint
    url      = "postgresql://${var.db_username}:${local.master_password}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${var.db_name}?sslmode=require"
  })
}

# PostgreSQL RDS Instance
resource "aws_db_instance" "main" {
  identifier            = "${var.name_prefix}-postgres"
  engine                = "postgres"
  engine_version        = var.engine_version
  instance_class        = var.instance_class
  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = var.storage_encrypted

  db_name  = var.db_name
  username = var.db_username
  password = local.master_password

  multi_az            = var.multi_az
  publicly_accessible = false
  db_subnet_group_name = (
    var.db_subnet_group_name != "" ? var.db_subnet_group_name :
    (length(aws_db_subnet_group.main) > 0 ? aws_db_subnet_group.main[0].name : null)
  )
  vpc_security_group_ids = (
    length(var.security_group_ids) > 0 ? var.security_group_ids :
    (length(aws_security_group.rds) > 0 ? [aws_security_group.rds[0].id] : [])
  )
  parameter_group_name = (
    var.create_parameter_group ? aws_db_parameter_group.postgres[0].name :
    (var.parameter_group_name != "" ? var.parameter_group_name : null)
  )

  backup_retention_period      = var.backup_retention_period
  backup_window                = "19:00-20:00"
  maintenance_window           = "Sun:20:30-Sun:21:30"
  auto_minor_version_upgrade   = true
  copy_tags_to_snapshot        = true
  performance_insights_enabled = var.performance_insights_enabled

  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = "${var.name_prefix}-postgres-final-snapshot"

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-postgres"
    }
  )

  lifecycle {
    prevent_destroy = false
    ignore_changes  = [password]
  }
}
