# 1. Application Load Balancer Security Group
resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-alb-sg"
  description = "Controls public inbound traffic to CodeSkill ALB"
  vpc_id      = var.vpc_id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-alb-sg"
    }
  )
}

resource "aws_security_group_rule" "alb_http_ingress" {
  type              = "ingress"
  security_group_id = aws_security_group.alb.id
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "Allow HTTP for redirect to HTTPS"
}

resource "aws_security_group_rule" "alb_https_ingress" {
  type              = "ingress"
  security_group_id = aws_security_group.alb.id
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "Allow public HTTPS inbound"
}

resource "aws_security_group_rule" "alb_to_app_egress" {
  type                     = "egress"
  security_group_id        = aws_security_group.alb.id
  from_port                = 0
  to_port                  = 65535
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.app.id
  description              = "Forward traffic from ALB to application instances"
}

# 2. Application EC2 Security Group
resource "aws_security_group" "app" {
  name        = "${var.name_prefix}-app-sg"
  description = "Controls ingress and egress for CodeSkill Application instances"
  vpc_id      = var.vpc_id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-app-sg"
    }
  )
}

resource "aws_security_group_rule" "app_http_from_alb" {
  type                     = "ingress"
  security_group_id        = aws_security_group.app.id
  from_port                = 80
  to_port                  = 80
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb.id
  description              = "Allow HTTP port 80 from ALB"
}

resource "aws_security_group_rule" "app_backend_from_alb" {
  type                     = "ingress"
  security_group_id        = aws_security_group.app.id
  from_port                = 5001
  to_port                  = 5001
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb.id
  description              = "Allow NestJS port 5001 directly from ALB"
}

resource "aws_security_group_rule" "app_frontend_from_alb" {
  type                     = "ingress"
  security_group_id        = aws_security_group.app.id
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb.id
  description              = "Allow Next.js port 3000 directly from ALB"
}

resource "aws_security_group_rule" "app_ssh_ingress" {
  count             = length(var.allowed_ssh_cidr_blocks) > 0 ? 1 : 0
  type              = "ingress"
  security_group_id = aws_security_group.app.id
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  cidr_blocks       = var.allowed_ssh_cidr_blocks
  description       = "Optional restricted SSH management"
}

resource "aws_security_group_rule" "app_to_rds_egress" {
  type                     = "egress"
  security_group_id        = aws_security_group.app.id
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.rds.id
  description              = "Outbound connection to RDS PostgreSQL"
}

resource "aws_security_group_rule" "app_to_judge0_egress" {
  type                     = "egress"
  security_group_id        = aws_security_group.app.id
  from_port                = 2358
  to_port                  = 2358
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.judge0.id
  description              = "Outbound connection to Judge0 Execution API"
}

resource "aws_security_group_rule" "app_https_egress" {
  type              = "egress"
  security_group_id = aws_security_group.app.id
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "Outbound HTTPS for AWS APIs, npm, GitHub, and packages"
}

resource "aws_security_group_rule" "app_http_egress" {
  type              = "egress"
  security_group_id = aws_security_group.app.id
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "Outbound HTTP for package mirrors and OS updates"
}

# 3. Judge0 Execution Host Security Group
resource "aws_security_group" "judge0" {
  name        = "${var.name_prefix}-judge0-sg"
  description = "Isolated security group for Judge0 code execution host"
  vpc_id      = var.vpc_id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-judge0-sg"
    }
  )
}

resource "aws_security_group_rule" "judge0_from_app" {
  type                     = "ingress"
  security_group_id        = aws_security_group.judge0.id
  from_port                = 2358
  to_port                  = 2358
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.app.id
  description              = "Allow Judge0 API calls strictly from authorized application instances"
}

resource "aws_security_group_rule" "judge0_ssh_ingress" {
  count             = length(var.allowed_ssh_cidr_blocks) > 0 ? 1 : 0
  type              = "ingress"
  security_group_id = aws_security_group.judge0.id
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  cidr_blocks       = var.allowed_ssh_cidr_blocks
  description       = "Optional restricted SSH management"
}

resource "aws_security_group_rule" "judge0_https_egress" {
  type              = "egress"
  security_group_id = aws_security_group.judge0.id
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "Outbound HTTPS for Docker image pulls, SSM, and OS packages"
}

resource "aws_security_group_rule" "judge0_http_egress" {
  type              = "egress"
  security_group_id = aws_security_group.judge0.id
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "Outbound HTTP for OS repositories"
}

# 4. RDS PostgreSQL Security Group
resource "aws_security_group" "rds" {
  name        = "${var.name_prefix}-rds-sg"
  description = "Controls database access strictly from application backend"
  vpc_id      = var.vpc_id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-rds-sg"
    }
  )
}

resource "aws_security_group_rule" "rds_from_app" {
  type                     = "ingress"
  security_group_id        = aws_security_group.rds.id
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.app.id
  description              = "Allow PostgreSQL 5432 strictly from Application SG"
}

# Monitoring Integration Rules (Prometheus, Loki, Node Exporter, PostgreSQL Exporter)
resource "aws_security_group_rule" "app_node_exporter_ingress" {
  type                     = "ingress"
  security_group_id        = aws_security_group.app.id
  from_port                = 9100
  to_port                  = 9100
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.judge0.id
  description              = "Allow Prometheus scraping of Node Exporter on Application instances"
}

resource "aws_security_group_rule" "app_to_loki_egress" {
  type                     = "egress"
  security_group_id        = aws_security_group.app.id
  from_port                = 3100
  to_port                  = 3100
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.judge0.id
  description              = "Allow Promtail on App to push logs to Loki on Judge0 host"
}

resource "aws_security_group_rule" "judge0_loki_ingress" {
  type                     = "ingress"
  security_group_id        = aws_security_group.judge0.id
  from_port                = 3100
  to_port                  = 3100
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.app.id
  description              = "Allow Loki log ingestion from App Promtail"
}

resource "aws_security_group_rule" "judge0_to_app_exporter_egress" {
  type                     = "egress"
  security_group_id        = aws_security_group.judge0.id
  from_port                = 9100
  to_port                  = 9100
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.app.id
  description              = "Allow Prometheus on Judge0 to scrape Application Node Exporter"
}

resource "aws_security_group_rule" "judge0_to_rds_egress" {
  type                     = "egress"
  security_group_id        = aws_security_group.judge0.id
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.rds.id
  description              = "Allow PostgreSQL Exporter on Judge0 to query RDS performance metrics"
}

resource "aws_security_group_rule" "rds_from_judge0_exporter" {
  type                     = "ingress"
  security_group_id        = aws_security_group.rds.id
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.judge0.id
  description              = "Allow PostgreSQL Exporter on Judge0 host to collect RDS metrics"
}

