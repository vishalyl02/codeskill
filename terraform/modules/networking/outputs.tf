output "vpc_id" {
  description = "The ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr_block" {
  description = "The CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "List of IDs of public subnets"
  value       = aws_subnet.public[*].id
}

output "private_app_subnet_ids" {
  description = "List of IDs of private application subnets"
  value       = aws_subnet.private_app[*].id
}

output "private_db_subnet_ids" {
  description = "List of IDs of private database subnets"
  value       = aws_subnet.private_db[*].id
}

output "private_judge0_subnet_ids" {
  description = "List of IDs of private Judge0 subnets"
  value       = aws_subnet.private_judge0[*].id
}

output "db_subnet_group_name" {
  description = "Name of the RDS DB subnet group"
  value       = aws_db_subnet_group.db.name
}

output "db_subnet_group_id" {
  description = "ID of the RDS DB subnet group"
  value       = aws_db_subnet_group.db.id
}

output "nat_gateway_ip" {
  description = "Public IP of the NAT Gateway if provisioned"
  value       = var.enable_nat_gateway ? aws_eip.nat[0].public_ip : null
}
