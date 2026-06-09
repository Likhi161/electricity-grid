#################################################
# IAM Instance Profile, Role, and Policies
#################################################

# 1. IAM Role for Backend EC2 Instance
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

# 2. IAM Policy for S3, Secrets Manager, and KMS Encryption Keys
resource "aws_iam_policy" "backend_policy" {
  name        = "smartgrid-backend-policy-${random_string.suffix.result}"
  description = "Allows backend EC2 instance to access S3 billing bucket, Secrets Manager configurations, and KMS encryption keys"

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
          "s3:ListBucket",
          "s3:DeleteObject"
        ]
        Resource = [
          aws_s3_bucket.bills_bucket.arn,
          "${aws_s3_bucket.bills_bucket.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey",
          "kms:Encrypt"
        ]
        Resource = aws_kms_key.s3_key.arn
      },
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = [
          module.lambda_unit_calculator.lambda_function_arn,
          module.lambda_bill_generator.lambda_function_arn,
          module.lambda_tariff_engine.lambda_function_arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = [
          module.sns_low_balance.topic_arn,
          module.sns_disconnection.topic_arn
        ]
      }
    ]
  })
}

# 3. Attach IAM Policy to Role
resource "aws_iam_role_policy_attachment" "backend_role_attach" {
  role       = aws_iam_role.backend_role.name
  policy_arn = aws_iam_policy.backend_policy.arn
}

# 4. EC2 Instance Profile
resource "aws_iam_instance_profile" "backend_profile" {
  name = "smartgrid-backend-profile-${random_string.suffix.result}"
  role = aws_iam_role.backend_role.name
}
