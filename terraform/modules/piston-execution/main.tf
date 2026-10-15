# Optional dedicated fleet. This module is intentionally NOT attached to the
# production stack until host/image/runtime/isolation validation is complete.
resource "aws_security_group" "execution" {
  name_prefix = "${var.name_prefix}-piston-"
  description = "Dedicated secret-free Piston host; no initiated outbound traffic"
  vpc_id      = var.vpc_id
  tags        = { Name = "${var.name_prefix}-piston" }
}
resource "aws_vpc_security_group_ingress_rule" "backend" {
  for_each                     = toset(var.trusted_backend_security_group_ids)
  security_group_id            = aws_security_group.execution.id
  referenced_security_group_id = each.value
  from_port                    = 2000
  to_port                      = 2000
  ip_protocol                  = "tcp"
  description                  = "Execution-only proxy from trusted API/workers"
}
resource "aws_vpc_security_group_ingress_rule" "maintenance" {
  for_each                     = toset(var.maintenance_security_group_ids)
  security_group_id            = aws_security_group.execution.id
  referenced_security_group_id = each.value
  from_port                    = 22
  to_port                      = 22
  ip_protocol                  = "tcp"
  description                  = "Private maintenance only"
}
resource "aws_instance" "execution" {
  ami                         = var.audited_linux_ami_id
  instance_type               = var.instance_type
  subnet_id                   = var.isolated_subnet_id
  associate_public_ip_address = false
  vpc_security_group_ids      = [aws_security_group.execution.id]
  key_name                    = var.maintenance_key_name
  # No IAM instance profile, user data secrets, Docker socket or application volumes.
  metadata_options {
    http_endpoint = "disabled"
  }
  root_block_device {
    encrypted   = true
    volume_size = 40
    volume_type = "gp3"
  }
  tags = { Name = "${var.name_prefix}-piston", Role = "untrusted-execution" }
}
