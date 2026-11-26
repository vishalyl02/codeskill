output "alb_dns_name" {
  description = "Public DNS name of the Application Load Balancer"
  value       = module.alb.alb_dns_name
}

output "alb_url" {
  description = "HTTP URL to access the ALB"
  value       = "http://${module.alb.alb_dns_name}"
}

output "s3_bucket_name" {
  description = "Name of the S3 bucket created for files and releases"
  value       = module.s3.bucket_name
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = module.redis.endpoint
}

output "db_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = module.rds.endpoint
}

