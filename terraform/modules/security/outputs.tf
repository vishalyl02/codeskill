output "alb_security_group_id" {
  description = "Security Group ID of the ALB"
  value       = aws_security_group.alb.id
}

output "app_security_group_id" {
  description = "Security Group ID of the Application instances"
  value       = aws_security_group.app.id
}

output "judge0_security_group_id" {
  description = "Security Group ID of the Judge0 execution instances"
  value       = aws_security_group.judge0.id
}

output "rds_security_group_id" {
  description = "Security Group ID of the RDS PostgreSQL database"
  value       = aws_security_group.rds.id
}
