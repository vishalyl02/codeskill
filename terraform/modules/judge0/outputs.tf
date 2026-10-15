output "judge0_asg_id" {
  description = "Auto Scaling Group ID for Judge0 primary host"
  value       = aws_autoscaling_group.judge0.id
}

output "judge0_asg_name" {
  description = "Auto Scaling Group Name for Judge0 primary host"
  value       = aws_autoscaling_group.judge0.name
}

output "judge0_launch_template_id" {
  description = "Launch Template ID for Judge0"
  value       = aws_launch_template.judge0.id
}

output "worker_asg_name" {
  description = "Auto Scaling Group Name for optional Judge0 workers"
  value       = var.judge0_worker_autoscaling_enabled ? aws_autoscaling_group.judge0_worker[0].name : null
}
