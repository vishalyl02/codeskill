data "aws_partition" "current" {}
data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
data "aws_vpc" "existing" { id = var.vpc_id }
data "aws_subnet" "existing" { id = var.subnet_id }
data "aws_ec2_instance_type" "selected" { instance_type = var.instance_type }
data "aws_security_group" "backend" {
  for_each = var.backend_security_group_ids
  id       = each.value
}
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical public AMI publisher
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-${var.runtime_architecture == "arm64" ? "arm64" : "amd64"}-server-*"]
  }
  filter {
    name   = "architecture"
    values = [var.runtime_architecture]
  }
}

locals {
  parameter_prefix = "/${var.name_prefix}"
  parameter_arn    = "arn:${data.aws_partition.current.partition}:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${local.parameter_prefix}/*"
}

resource "aws_security_group" "judges" {
  name_prefix = "${var.name_prefix}-"
  description = "Private Judge0 and Piston APIs from the existing backend only"
  vpc_id      = var.vpc_id
  tags        = var.tags
}
resource "aws_vpc_security_group_ingress_rule" "judge0" {
  for_each                     = contains(var.enabled_providers, "judge0") ? var.backend_security_group_ids : toset([])
  security_group_id            = aws_security_group.judges.id
  referenced_security_group_id = each.value
  from_port                    = 2358
  to_port                      = 2358
  ip_protocol                  = "tcp"
}
resource "aws_vpc_security_group_ingress_rule" "piston" {
  for_each                     = contains(var.enabled_providers, "piston") ? var.backend_security_group_ids : toset([])
  security_group_id            = aws_security_group.judges.id
  referenced_security_group_id = each.value
  from_port                    = 2001
  to_port                      = 2001
  ip_protocol                  = "tcp"
}
resource "aws_vpc_security_group_egress_rule" "bootstrap" {
  for_each          = toset(["80", "443"])
  security_group_id = aws_security_group.judges.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = tonumber(each.value)
  to_port           = tonumber(each.value)
  ip_protocol       = "tcp"
}

resource "aws_iam_role" "judge" {
  name_prefix = "${var.name_prefix}-"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
  tags = var.tags
}
resource "aws_iam_role_policy" "judge" {
  role = aws_iam_role.judge.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SessionManagerAgent"
        Effect   = "Allow"
        Action   = ["ssm:UpdateInstanceInformation", "ssm:ListInstanceAssociations", "ssm:DescribeAssociation", "ssm:UpdateAssociationStatus", "ssm:UpdateInstanceAssociationStatus", "ssmmessages:CreateControlChannel", "ssmmessages:CreateDataChannel", "ssmmessages:OpenControlChannel", "ssmmessages:OpenDataChannel", "ec2messages:AcknowledgeMessage", "ec2messages:DeleteMessage", "ec2messages:FailMessage", "ec2messages:GetEndpoint", "ec2messages:GetMessages", "ec2messages:SendReply"]
        Resource = "*"
      },
      {
        Sid      = "ReadOneRuntimeBundle"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "arn:${data.aws_partition.current.partition}:s3:::${var.runtime_bundle_bucket}/${var.runtime_bundle_key}"
      },
      {
        Sid      = "PublishJudgeEndpointsAndToken"
        Effect   = "Allow"
        Action   = ["ssm:PutParameter"]
        Resource = local.parameter_arn
      }
    ]
  })
}
resource "aws_iam_instance_profile" "judge" {
  name_prefix = "${var.name_prefix}-"
  role        = aws_iam_role.judge.name
}

resource "aws_instance" "shared" {
  ami                         = var.ami_id != "" ? var.ami_id : data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_id
  associate_public_ip_address = false
  vpc_security_group_ids      = [aws_security_group.judges.id]
  iam_instance_profile        = aws_iam_instance_profile.judge.name
  monitoring                  = false
  disable_api_termination     = true
  credit_specification {
    cpu_credits = "standard"
  }
  user_data = templatefile("${path.module}/userdata.sh.tftpl", {
    region               = data.aws_region.current.name
    bundle_bucket        = var.runtime_bundle_bucket
    bundle_key           = var.runtime_bundle_key
    bundle_sha256        = var.runtime_bundle_sha256
    runtime_architecture = var.runtime_architecture
    parameter_prefix     = local.parameter_prefix
    enabled_providers    = join(",", sort(tolist(var.enabled_providers)))
  })
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }
  root_block_device {
    encrypted   = true
    volume_type = "gp3"
    volume_size = var.root_volume_size
  }
  tags = merge(var.tags, { Name = var.name_prefix, Role = "untrusted-judges", Providers = join(",", sort(tolist(var.enabled_providers))) })
  lifecycle {
    prevent_destroy = true
    # Cloud-init runs once. Native runtime releases are drained, rebuilt and
    # verified in place via SSM; changing an artifact must not reboot the host.
    ignore_changes = [user_data]
    precondition {
      condition     = !var.require_free_plan_eligibility || data.aws_ec2_instance_type.selected.free_tier_eligible
      error_message = "The selected EC2 type is not eligible for this AWS Free Plan. No instance will be created."
    }
    precondition {
      condition     = contains(data.aws_ec2_instance_type.selected.supported_architectures, var.runtime_architecture)
      error_message = "EC2 architecture does not match the native source build configuration."
    }
    precondition {
      condition     = data.aws_subnet.existing.vpc_id == var.vpc_id && alltrue([for group in data.aws_security_group.backend : group.vpc_id == var.vpc_id])
      error_message = "The judge subnet and backend security groups must belong to the existing VPC."
    }
  }
}
