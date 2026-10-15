output "app_instance_profile_name" {
  description = "Name of the IAM instance profile for application instances"
  value       = aws_iam_instance_profile.app.name
}

output "app_instance_profile_arn" {
  description = "ARN of the IAM instance profile for application instances"
  value       = aws_iam_instance_profile.app.arn
}

output "app_role_name" {
  description = "Name of the application IAM role"
  value       = aws_iam_role.app.name
}

output "app_role_arn" {
  description = "ARN of the application IAM role"
  value       = aws_iam_role.app.arn
}

output "judge0_instance_profile_name" {
  description = "Name of the IAM instance profile for Judge0 instances"
  value       = aws_iam_instance_profile.judge0.name
}

output "judge0_instance_profile_arn" {
  description = "ARN of the IAM instance profile for Judge0 instances"
  value       = aws_iam_instance_profile.judge0.arn
}

output "judge0_role_name" {
  description = "Name of the Judge0 IAM role"
  value       = aws_iam_role.judge0.name
}

# Compatibility output for older references
output "instance_profile_name" {
  description = "Alias for app_instance_profile_name"
  value       = aws_iam_instance_profile.app.name
}
