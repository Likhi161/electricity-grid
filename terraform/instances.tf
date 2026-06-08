#################################################
# EC2 Instances
#################################################

resource "aws_instance" "bastion" {
  ami                         = "ami-07a00cf47dbbc844c"
  instance_type               = "t2.micro"
  subnet_id                   = aws_subnet.public_a.id
  associate_public_ip_address = true
  vpc_security_group_ids      = [aws_security_group.bastion_sg.id]
  key_name                    = "Likhitha-pem"

  tags = {
    Name = "smartgrid-bastion"
  }
}

resource "aws_instance" "frontend" {
  ami                         = "ami-07a00cf47dbbc844c"
  instance_type               = "t2.micro"
  subnet_id                   = aws_subnet.public_a.id
  associate_public_ip_address = true
  vpc_security_group_ids      = [aws_security_group.frontend_sg.id]
  key_name                    = "Likhitha-pem"

  tags = {
    Name = "smartgrid-frontend"
  }
}

resource "aws_instance" "backend" {
  ami                    = "ami-07a00cf47dbbc844c"
  instance_type          = "t2.micro"
  subnet_id              = aws_subnet.private_app_a.id
  vpc_security_group_ids = [aws_security_group.backend_sg.id]
  key_name               = "Likhitha-pem"
  iam_instance_profile   = aws_iam_instance_profile.backend_profile.name

  tags = {
    Name = "smartgrid-backend"
  }
}

resource "aws_instance" "database" {
  ami                    = "ami-07a00cf47dbbc844c"
  instance_type          = "t2.micro"
  subnet_id              = aws_subnet.private_db_a.id
  vpc_security_group_ids = [aws_security_group.db_sg.id]
  key_name               = "Likhitha-pem"

  tags = {
    Name = "smartgrid-database"
  }
}
