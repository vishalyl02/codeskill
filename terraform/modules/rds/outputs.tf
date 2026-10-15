output "endpoint" {
  description = "Connection endpoint for the RDS PostgreSQL database"
  value       = aws_db_instance.main.endpoint
}

output "address" {
  description = "Hostname address of the RDS PostgreSQL database"
  value       = aws_db_instance.main.address
}

output "port" {
  description = "Database listening port"
  value       = aws_db_instance.main.port
}

output "db_name" {
  description = "Name of the default PostgreSQL database"
  value       = aws_db_instance.main.db_name
}

output "db_identifier" {
  description = "RDS DB instance identifier"
  value       = aws_db_instance.main.identifier
}

output "secret_arn" {
  description = "ARN of the Secrets Manager secret storing database credentials"
  value       = aws_secretsmanager_secret.db_credentials.arn
}

output "db_username" {
  description = "Master username for database"
  value       = var.db_username
}
