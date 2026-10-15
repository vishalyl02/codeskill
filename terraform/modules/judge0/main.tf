# Query latest Amazon Linux 2023 x86_64 AMI
data "aws_ami" "al2023_x86_64" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }
}

locals {
  ami_id = var.ami_id != "" ? var.ami_id : data.aws_ami.al2023_x86_64.id
}

# 1. Primary Judge0 Execution Host Launch Template
resource "aws_launch_template" "judge0" {
  name_prefix   = "${var.name_prefix}-judge0-lt-"
  image_id      = local.ami_id
  instance_type = var.instance_type

  iam_instance_profile {
    name = var.iam_instance_profile_name
  }

  vpc_security_group_ids = var.security_group_ids

  user_data = var.user_data_base64 != "" ? var.user_data_base64 : null

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = var.root_volume_size
      volume_type           = "gp3"
      iops                  = 3000
      throughput            = 125
      encrypted             = true
      delete_on_termination = true
    }
  }

  # Hardened metadata options: IMDSv2 enforced, hop limit 1 prevents container extraction
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  monitoring {
    enabled = true
  }

  tag_specifications {
    resource_type = "instance"
    tags = merge(
      var.tags,
      {
        Name = "${var.name_prefix}-judge0-primary"
        Role = "judge0-execution"
        Arch = "x86_64"
      }
    )
  }

  tag_specifications {
    resource_type = "volume"
    tags = merge(
      var.tags,
      {
        Name = "${var.name_prefix}-judge0-volume"
      }
    )
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Primary Judge0 Auto Scaling Group (min 1, desired 1, max 1 for automatic recovery)
resource "aws_autoscaling_group" "judge0" {
  name_prefix         = "${var.name_prefix}-judge0-asg-"
  vpc_zone_identifier = var.subnet_ids

  min_size         = var.min_size
  desired_capacity = var.desired_capacity
  max_size         = var.max_size

  health_check_type         = "EC2"
  health_check_grace_period = 300
  default_cooldown          = 180

  launch_template {
    id      = aws_launch_template.judge0.id
    version = "$Latest"
  }

  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 0
      instance_warmup        = 300
    }
  }

  dynamic "tag" {
    for_each = merge(
      var.tags,
      {
        Name        = "${var.name_prefix}-judge0-host"
        Role        = "judge0-execution"
        Environment = var.tags["Environment"] != null ? var.tags["Environment"] : "production"
      }
    )
    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

# -------------------------------------------------------------------------------------------------
# 2. Future Optional Judge0 Worker Fleet (Disabled by default: judge0_worker_autoscaling_enabled = false)
# Requires shared execution queue & verified horizontal worker registration before enabling.
# -------------------------------------------------------------------------------------------------
resource "aws_launch_template" "judge0_worker" {
  count         = var.judge0_worker_autoscaling_enabled ? 1 : 0
  name_prefix   = "${var.name_prefix}-judge0-worker-lt-"
  image_id      = local.ami_id
  instance_type = var.judge0_worker_instance_type

  iam_instance_profile {
    name = var.iam_instance_profile_name
  }

  vpc_security_group_ids = var.security_group_ids
  user_data              = var.worker_user_data_base64 != "" ? var.worker_user_data_base64 : null

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = var.root_volume_size
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  tag_specifications {
    resource_type = "instance"
    tags = merge(
      var.tags,
      {
        Name = "${var.name_prefix}-judge0-worker"
        Role = "judge0-worker"
      }
    )
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_autoscaling_group" "judge0_worker" {
  count               = var.judge0_worker_autoscaling_enabled ? 1 : 0
  name_prefix         = "${var.name_prefix}-judge0-worker-asg-"
  vpc_zone_identifier = var.subnet_ids

  min_size         = var.judge0_worker_min_size
  desired_capacity = var.judge0_worker_desired_capacity
  max_size         = var.judge0_worker_max_size

  health_check_type         = "EC2"
  health_check_grace_period = 300

  launch_template {
    id      = aws_launch_template.judge0_worker[0].id
    version = "$Latest"
  }

  dynamic "tag" {
    for_each = merge(
      var.tags,
      {
        Name = "${var.name_prefix}-judge0-worker-node"
        Role = "judge0-worker"
      }
    )
    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}
