#################################################
# Cloud Services - S3, Secrets Manager, IAM
#################################################

resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

# 1. S3 Bucket for Bills
resource "aws_s3_bucket" "bills_bucket" {
  bucket        = "smartgrid-bills-bucket-${random_string.suffix.result}"
  force_destroy = true

  tags = {
    Name        = "smartgrid-bills-bucket"
    Environment = "production"
  }
}

resource "aws_s3_bucket_public_access_block" "bills_bucket_acl" {
  bucket = aws_s3_bucket.bills_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 2. AWS Secrets Manager Secret
resource "aws_secretsmanager_secret" "smartgrid_secret" {
  name                    = "smartgrid/config"
  description             = "Database credentials and config variables for SmartGrid microservices"
  recovery_window_in_days = 0 # Force delete immediately on destroy
}

resource "aws_secretsmanager_secret_version" "smartgrid_secret_version" {
  secret_id = aws_secretsmanager_secret.smartgrid_secret.id
  secret_string = jsonencode({
    NODE_ENV       = "production"
    DB_HOST        = aws_instance.database.private_ip
    DB_PORT        = "3306"
    DB_USER        = "smartgrid_user"
    DB_PASSWORD    = "password"
    DB_NAME        = "smartgrid"
    JWT_SECRET     = "a2b53cdd87431e5630283c448f72ee7b2c91b5da8d1234c9fb66b3f7efc4901f"
    SMTP_HOST      = "smtp.mailtrap.io"
    SMTP_PORT      = "2525"
    SMTP_USER      = ""
    SMTP_PASS      = ""
    SENDER_EMAIL   = "noreply@smartgrid.com"
    S3_BUCKET_NAME = aws_s3_bucket.bills_bucket.id
    AWS_REGION     = var.aws_region
  })
}

# 3. IAM Role for Backend EC2 Instance
resource "aws_iam_role" "backend_role" {
  name = "smartgrid-backend-role-${random_string.suffix.result}"

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
}

# 4. IAM Policy for S3 and Secrets Manager Access
resource "aws_iam_policy" "backend_policy" {
  name        = "smartgrid-backend-policy-${random_string.suffix.result}"
  description = "Allows backend EC2 instance to access S3 billing bucket and read Secrets Manager configurations"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = aws_secretsmanager_secret.smartgrid_secret.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.bills_bucket.arn,
          "${aws_s3_bucket.bills_bucket.arn}/*"
        ]
      }
    ]
  })
}

# 5. Attach IAM Policy to Role
resource "aws_iam_role_policy_attachment" "backend_role_attach" {
  role       = aws_iam_role.backend_role.name
  policy_arn = aws_iam_policy.backend_policy.arn
}

# 6. EC2 Instance Profile
resource "aws_iam_instance_profile" "backend_profile" {
  name = "smartgrid-backend-profile-${random_string.suffix.result}"
  role = aws_iam_role.backend_role.name
}
