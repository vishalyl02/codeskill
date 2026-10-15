# 1. Application Role & Instance Profile
resource "aws_iam_role" "app" {
  name = "${var.name_prefix}-app-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-app-role"
  })
}

# SSM Session Manager for keyless secure administrative access
resource "aws_iam_role_policy_attachment" "app_ssm" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}


# Secrets Manager Read Access for Application
resource "aws_iam_policy" "app_secrets" {
  name        = "${var.name_prefix}-app-secrets"
  description = "Allows Application instances to retrieve DB credentials and app secrets"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = var.secrets_arn_prefix == "*" ? "*" : "${var.secrets_arn_prefix}*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "app_secrets" {
  role       = aws_iam_role.app.name
  policy_arn = aws_iam_policy.app_secrets.arn
}

# S3 Access Policy (if bucket is configured)
resource "aws_iam_policy" "app_s3" {
  count       = var.s3_bucket_arn != "" ? 1 : 0
  name        = "${var.name_prefix}-app-s3"
  description = "Allows Application instances to access CodeSkill S3 storage"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          var.s3_bucket_arn,
          "${var.s3_bucket_arn}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "app_s3" {
  count      = var.s3_bucket_arn != "" ? 1 : 0
  role       = aws_iam_role.app.name
  policy_arn = aws_iam_policy.app_s3[0].arn
}

resource "aws_iam_instance_profile" "app" {
  name = "${var.name_prefix}-app-profile"
  role = aws_iam_role.app.name
}

# 2. Judge0 Dedicated Role & Instance Profile (No DB, No Secrets, No S3 access!)
resource "aws_iam_role" "judge0" {
  name = "${var.name_prefix}-judge0-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-judge0-role"
  })
}

resource "aws_iam_role_policy_attachment" "judge0_ssm" {
  role       = aws_iam_role.judge0.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}


resource "aws_iam_instance_profile" "judge0" {
  name = "${var.name_prefix}-judge0-profile"
  role = aws_iam_role.judge0.name
}

