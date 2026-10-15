output "instance_id" { value = aws_instance.shared.id }
output "judge0_url" { value = "http://${aws_instance.shared.private_ip}:2358" }
output "piston_url" { value = "http://${aws_instance.shared.private_ip}:2001/api/v2" }
output "judge0_token_parameter" { value = "${local.parameter_prefix}/auth-token" }
