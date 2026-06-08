#################################################
# VPC
#################################################

resource "aws_vpc" "smartgrid_vpc" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "smartgrid-vpc"
  }
}

#################################################
# Availability Zones
#################################################

data "aws_availability_zones" "available" {}

#################################################
# Subnets
#################################################

# Public A
resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.smartgrid_vpc.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true

  tags = {
    Name = "public-subnet-a"
  }
}

# Public B
resource "aws_subnet" "public_b" {
  vpc_id                  = aws_vpc.smartgrid_vpc.id
  cidr_block              = "10.0.2.0/24"
  availability_zone       = data.aws_availability_zones.available.names[1]
  map_public_ip_on_launch = true

  tags = {
    Name = "public-subnet-b"
  }
}

# Private App A
resource "aws_subnet" "private_app_a" {
  vpc_id            = aws_vpc.smartgrid_vpc.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = data.aws_availability_zones.available.names[0]

  tags = {
    Name = "private-app-a"
  }
}

# Private App B
resource "aws_subnet" "private_app_b" {
  vpc_id            = aws_vpc.smartgrid_vpc.id
  cidr_block        = "10.0.12.0/24"
  availability_zone = data.aws_availability_zones.available.names[1]

  tags = {
    Name = "private-app-b"
  }
}

# Private DB A
resource "aws_subnet" "private_db_a" {
  vpc_id            = aws_vpc.smartgrid_vpc.id
  cidr_block        = "10.0.21.0/24"
  availability_zone = data.aws_availability_zones.available.names[0]

  tags = {
    Name = "private-db-a"
  }
}

# Private DB B
resource "aws_subnet" "private_db_b" {
  vpc_id            = aws_vpc.smartgrid_vpc.id
  cidr_block        = "10.0.22.0/24"
  availability_zone = data.aws_availability_zones.available.names[1]

  tags = {
    Name = "private-db-b"
  }
}

#################################################
# Internet Gateway
#################################################

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.smartgrid_vpc.id

  tags = {
    Name = "smartgrid-igw"
  }
}

#################################################
# NAT Gateway
#################################################

resource "aws_eip" "nat_eip" {
  domain = "vpc"
}

resource "aws_nat_gateway" "nat" {
  allocation_id = aws_eip.nat_eip.id
  subnet_id     = aws_subnet.public_a.id

  tags = {
    Name = "smartgrid-nat"
  }

  depends_on = [aws_internet_gateway.igw]
}

#################################################
# Route Tables
#################################################

resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.smartgrid_vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }
}

resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public_rt.id
}

resource "aws_route_table_association" "public_b" {
  subnet_id      = aws_subnet.public_b.id
  route_table_id = aws_route_table.public_rt.id
}

resource "aws_route_table" "private_rt" {
  vpc_id = aws_vpc.smartgrid_vpc.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat.id
  }
}

resource "aws_route_table_association" "private_app_a" {
  subnet_id      = aws_subnet.private_app_a.id
  route_table_id = aws_route_table.private_rt.id
}

resource "aws_route_table_association" "private_app_b" {
  subnet_id      = aws_subnet.private_app_b.id
  route_table_id = aws_route_table.private_rt.id
}

resource "aws_route_table" "db_rt" {
  vpc_id = aws_vpc.smartgrid_vpc.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat.id
  }
}

resource "aws_route_table_association" "db_a" {
  subnet_id      = aws_subnet.private_db_a.id
  route_table_id = aws_route_table.db_rt.id
}

resource "aws_route_table_association" "db_b" {
  subnet_id      = aws_subnet.private_db_b.id
  route_table_id = aws_route_table.db_rt.id
}
