#################################################
# Secrets Manager Configuration
#################################################

resource "aws_secretsmanager_secret" "smartgrid_secret" {
  name                    = "smartgrid/config"
  description             = "Database credentials and config variables for SmartGrid microservices"
  recovery_window_in_days = 0 # Force delete immediately on destroy
}
