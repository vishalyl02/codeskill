output "alb_dns_name" {
  description = "Public DNS name of the Application Load Balancer. Point your DNS CNAME (e.g., codeskill.novaserve.cloud) to this hostname."
  value       = module.alb.alb_dns_name
}

output "alb_zone_id" {
  description = "Canonical Hosted Zone ID of the ALB (for Route 53 ALIAS records)"
  value       = module.alb.alb_zone_id
}

output "platform_url" {
  description = "Configured public URL for the CodeSkill platform"
  value       = "https://${var.domain_name}"
}

output "rds_endpoint" {
  description = "Connection endpoint of the PostgreSQL RDS database"
  value       = module.rds.endpoint
}

output "rds_database_name" {
  description = "Name of the production PostgreSQL database"
  value       = module.rds.db_name
}

output "rds_secret_arn" {
  description = "ARN of the Secrets Manager secret storing PostgreSQL credentials"
  value       = module.rds.secret_arn
}

output "app_asg_name" {
  description = "Name of the Application Auto Scaling Group"
  value       = module.application_asg.asg_name
}

output "judge0_asg_name" {
  description = "Name of the Judge0 Auto Scaling Group"
  value       = module.judge0.judge0_asg_name
}

output "sns_alerts_topic_arn" {
  description = "ARN of the SNS topic for AWS Budgets and alert notifications"
  value       = module.monitoring.sns_topic_arn
}

output "monitoring_stack" {
  description = "Overview of active Open-Source monitoring services"
  value       = module.monitoring.monitoring_stack_summary
}

output "grafana_tunnel_command" {
  description = "SSM Session Manager command to tunnel Grafana OSS port 3001 securely to your local machine (http://localhost:3001)"
  value       = "aws ssm start-session --target $(aws ec2 describe-instances --filters \"Name=tag:Name,Values=${local.name_prefix}-judge0-host\" \"Name=instance-state-name,Values=running\" --query \"Reservations[0].Instances[0].InstanceId\" --output text --region ${var.aws_region}) --document-name AWS-StartPortForwardingSession --parameters '{\"portNumber\":[\"3001\"],\"localPortNumber\":[\"3001\"]}' --region ${var.aws_region}"
}

output "uptime_kuma_tunnel_command" {
  description = "SSM Session Manager command to tunnel Uptime Kuma port 3002 securely to your local machine (http://localhost:3002)"
  value       = "aws ssm start-session --target $(aws ec2 describe-instances --filters \"Name=tag:Name,Values=${local.name_prefix}-judge0-host\" \"Name=instance-state-name,Values=running\" --query \"Reservations[0].Instances[0].InstanceId\" --output text --region ${var.aws_region}) --document-name AWS-StartPortForwardingSession --parameters '{\"portNumber\":[\"3002\"],\"localPortNumber\":[\"3002\"]}' --region ${var.aws_region}"
}


output "budget_name" {
  description = "Name of the AWS Budget"
  value       = module.cost_controls.budget_name
}

output "budget_limit_usd" {
  description = "Configured monthly spending budget limit in USD"
  value       = module.cost_controls.budget_limit_usd
}

output "ssm_app_connect_command" {
  description = "AWS CLI SSM Session Manager command to securely connect to an application instance without SSH keys"
  value       = "aws ssm start-session --target $(aws ec2 describe-instances --filters \"Name=tag:Name,Values=${local.name_prefix}-app-asg-node\" \"Name=instance-state-name,Values=running\" --query \"Reservations[0].Instances[0].InstanceId\" --output text --region ${var.aws_region}) --region ${var.aws_region}"
}

output "ssm_judge0_connect_command" {
  description = "AWS CLI SSM Session Manager command to securely connect to the Judge0 instance without SSH keys"
  value       = "aws ssm start-session --target $(aws ec2 describe-instances --filters \"Name=tag:Name,Values=${local.name_prefix}-judge0-host\" \"Name=instance-state-name,Values=running\" --query \"Reservations[0].Instances[0].InstanceId\" --output text --region ${var.aws_region}) --region ${var.aws_region}"
}
