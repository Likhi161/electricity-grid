#################################################
# Secrets Manager Configuration
#################################################

resource "aws_secretsmanager_secret" "smartgrid_secret" {
  name                    = "smartgrid/config"
  description             = "Database credentials and config variables for SmartGrid microservices"
  recovery_window_in_days = 0 # Force delete immediately on destroy
}

resource "aws_secretsmanager_secret_version" "smartgrid_secret_val" {
  secret_id     = aws_secretsmanager_secret.smartgrid_secret.id
  secret_string = jsonencode({
    NODE_ENV               = "production"
    DB_HOST                = aws_instance.database.private_ip
    DB_PORT                = "3306"
    DB_USER                = "smartgrid_user"
    DB_PASSWORD            = "password"
    DB_NAME                = "smartgrid"
    JWT_SECRET             = "a2b53cdd87431e5630283c448f72ee7b2c91b5da8d1234c9fb66b3f7efc4901f"
    SMTP_HOST              = "smtp.mailtrap.io"
    SMTP_PORT              = "2525"
    SMTP_USER              = ""
    SMTP_PASS              = ""
    SENDER_EMAIL           = "noreply@smartgrid.com"
    S3_BUCKET_NAME         = aws_s3_bucket.bills_bucket.id
    AWS_REGION             = var.aws_region
    LAMBDA_UNIT_CALCULATOR = module.lambda_unit_calculator.lambda_function_name
    LAMBDA_BILL_GENERATOR  = module.lambda_bill_generator.lambda_function_name
    LAMBDA_TARIFF_ENGINE   = module.lambda_tariff_engine.lambda_function_name
    SNS_LOW_BALANCE_ARN    = module.sns_low_balance.topic_arn
    SNS_DISCONNECTION_ARN  = module.sns_disconnection.topic_arn
  })
}
