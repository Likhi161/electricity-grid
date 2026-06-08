#################################################
# Outputs
#################################################

output "vpc_id" {
  value       = aws_vpc.smartgrid_vpc.id
  description = "The ID of the VPC"
}

output "bastion_public_ip" {
  value       = aws_instance.bastion.public_ip
  description = "Public IP address of the Bastion Host"
}

output "frontend_public_ip" {
  value       = aws_instance.frontend.public_ip
  description = "Public IP address of the Frontend Server"
}

output "backend_private_ip" {
  value       = aws_instance.backend.private_ip
  description = "Private IP address of the Backend Server"
}

output "database_private_ip" {
  value       = aws_instance.database.private_ip
  description = "Private IP address of the Database Server"
}

output "alb_dns_name" {
  value       = aws_lb.smartgrid_alb.dns_name
  description = "The DNS name of the Application Load Balancer"
}
