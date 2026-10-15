resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-vpc"
    }
  )
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-igw"
    }
  )
}

# Public Subnets (ALB, and app instances when NAT is disabled in Budget profile)
resource "aws_subnet" "public" {
  count                   = length(var.public_subnets)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnets[count.index]
  availability_zone       = var.azs[count.index]
  map_public_ip_on_launch = true

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-public-${var.azs[count.index]}"
      Type = "Public"
    }
  )
}

# Private Application Subnets
resource "aws_subnet" "private_app" {
  count                   = length(var.private_app_subnets)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.private_app_subnets[count.index]
  availability_zone       = var.azs[count.index]
  map_public_ip_on_launch = false

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-private-app-${var.azs[count.index]}"
      Type = "PrivateApp"
    }
  )
}

# Private Database Subnets
resource "aws_subnet" "private_db" {
  count                   = length(var.private_db_subnets)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.private_db_subnets[count.index]
  availability_zone       = var.azs[count.index]
  map_public_ip_on_launch = false

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-private-db-${var.azs[count.index]}"
      Type = "PrivateDB"
    }
  )
}

# Private Judge0 Subnets
resource "aws_subnet" "private_judge0" {
  count                   = length(var.private_judge0_subnets)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.private_judge0_subnets[count.index]
  availability_zone       = var.azs[count.index]
  map_public_ip_on_launch = false

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-private-judge0-${var.azs[count.index]}"
      Type = "PrivateJudge0"
    }
  )
}

# RDS DB Subnet Group
resource "aws_db_subnet_group" "db" {
  name        = "${var.name_prefix}-db-subnet-group"
  description = "Subnet group for private RDS PostgreSQL instance"
  subnet_ids  = aws_subnet.private_db[*].id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-db-subnet-group"
    }
  )
}

# Optional Elastic IP and NAT Gateway (Exam profile or when explicitly enabled)
resource "aws_eip" "nat" {
  count  = var.enable_nat_gateway ? 1 : 0
  domain = "vpc"

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-nat-eip"
    }
  )
}

resource "aws_nat_gateway" "main" {
  count         = var.enable_nat_gateway ? 1 : 0
  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-nat-gw"
    }
  )

  depends_on = [aws_internet_gateway.main]
}

# Public Route Table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-public-rt"
    }
  )
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private App Route Table
resource "aws_route_table" "private_app" {
  vpc_id = aws_vpc.main.id

  dynamic "route" {
    for_each = var.enable_nat_gateway ? [1] : []
    content {
      cidr_block     = "0.0.0.0/0"
      nat_gateway_id = aws_nat_gateway.main[0].id
    }
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-private-app-rt"
    }
  )
}

resource "aws_route_table_association" "private_app" {
  count          = length(aws_subnet.private_app)
  subnet_id      = aws_subnet.private_app[count.index].id
  route_table_id = aws_route_table.private_app.id
}

# Private Judge0 Route Table
resource "aws_route_table" "private_judge0" {
  vpc_id = aws_vpc.main.id

  dynamic "route" {
    for_each = var.enable_nat_gateway ? [1] : []
    content {
      cidr_block     = "0.0.0.0/0"
      nat_gateway_id = aws_nat_gateway.main[0].id
    }
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-private-judge0-rt"
    }
  )
}

resource "aws_route_table_association" "private_judge0" {
  count          = length(aws_subnet.private_judge0)
  subnet_id      = aws_subnet.private_judge0[count.index].id
  route_table_id = aws_route_table.private_judge0.id
}

# Private DB Route Table (No internet route - maximum security)
resource "aws_route_table" "private_db" {
  vpc_id = aws_vpc.main.id

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-private-db-rt"
    }
  )
}

resource "aws_route_table_association" "private_db" {
  count          = length(aws_subnet.private_db)
  subnet_id      = aws_subnet.private_db[count.index].id
  route_table_id = aws_route_table.private_db.id
}

# Free S3 Gateway VPC Endpoint (saves data transfer & NAT charges)
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids = compact([
    aws_route_table.public.id,
    aws_route_table.private_app.id,
    aws_route_table.private_judge0.id
  ])

  tags = merge(
    var.tags,
    {
      Name = "${var.name_prefix}-s3-vpc-endpoint"
    }
  )
}

data "aws_region" "current" {}
