#################################################
# S3 Storage & Encryption Keys
#################################################

# 1. Random suffix for bucket uniqueness
resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

# 2. KMS Key for S3 Server-Side Encryption
resource "aws_kms_key" "s3_key" {
  description             = "KMS key for encrypting S3 billing bucket"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = {
    Name = "smartgrid-s3-kms-key"
  }
}

resource "aws_kms_alias" "s3_key_alias" {
  name          = "alias/smartgrid-s3-key"
  target_key_id = aws_kms_key.s3_key.key_id
}

# 3. S3 Bucket for monthly billing invoices
resource "aws_s3_bucket" "bills_bucket" {
  bucket        = "smartgrid-bills-bucket-${random_string.suffix.result}"
  force_destroy = true

  tags = {
    Name        = "smartgrid-bills-bucket"
    Environment = "production"
  }
}

# 4. Enable default SSE-KMS encryption using custom KMS Key
resource "aws_s3_bucket_server_side_encryption_configuration" "bills_bucket_sse" {
  bucket = aws_s3_bucket.bills_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.s3_key.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# 5. Restrict public access to S3 bucket
resource "aws_s3_bucket_public_access_block" "bills_bucket_acl" {
  bucket = aws_s3_bucket.bills_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
