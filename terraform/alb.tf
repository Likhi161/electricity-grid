#################################################
# Application Load Balancer & Routing
#################################################

# 1. ALB Security Group (Public Web Access)
resource "aws_security_group" "alb_sg" {
  name        = "smartgrid-alb-sg"
  description = "Allows public HTTP traffic to the ALB"
  vpc_id      = aws_vpc.smartgrid_vpc.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "smartgrid-alb-sg"
  }
}

# 2. Application Load Balancer
resource "aws_lb" "smartgrid_alb" {
  name               = "smartgrid-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_sg.id]
  subnets            = [aws_subnet.public_a.id, aws_subnet.public_b.id]

  tags = {
    Name = "smartgrid-alb"
  }
}

# 3. Target Groups
resource "aws_lb_target_group" "tg_frontend" {
  name     = "tg-frontend"
  port     = 80
  protocol = "HTTP"
  vpc_id   = aws_vpc.smartgrid_vpc.id

  health_check {
    path                = "/"
    protocol            = "HTTP"
    matcher             = "200-399"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 3
    unhealthy_threshold = 3
  }
}

resource "aws_lb_target_group" "tg_auth" {
  name     = "tg-auth"
  port     = 3001
  protocol = "HTTP"
  vpc_id   = aws_vpc.smartgrid_vpc.id

  health_check {
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 15
    timeout             = 3
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }
}

resource "aws_lb_target_group" "tg_consumer" {
  name     = "tg-consumer"
  port     = 3002
  protocol = "HTTP"
  vpc_id   = aws_vpc.smartgrid_vpc.id

  health_check {
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 15
    timeout             = 3
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }
}

resource "aws_lb_target_group" "tg_meter" {
  name     = "tg-meter"
  port     = 3003
  protocol = "HTTP"
  vpc_id   = aws_vpc.smartgrid_vpc.id

  health_check {
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 15
    timeout             = 3
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }
}

resource "aws_lb_target_group" "tg_billing" {
  name     = "tg-billing"
  port     = 3004
  protocol = "HTTP"
  vpc_id   = aws_vpc.smartgrid_vpc.id

  health_check {
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 15
    timeout             = 3
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }
}

resource "aws_lb_target_group" "tg_alert" {
  name     = "tg-alert"
  port     = 3005
  protocol = "HTTP"
  vpc_id   = aws_vpc.smartgrid_vpc.id

  health_check {
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 15
    timeout             = 3
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }
}

# 4. Target Group Attachments
resource "aws_lb_target_group_attachment" "frontend_attach" {
  target_group_arn = aws_lb_target_group.tg_frontend.arn
  target_id        = aws_instance.frontend.id
  port             = 80
}

resource "aws_lb_target_group_attachment" "auth_attach" {
  target_group_arn = aws_lb_target_group.tg_auth.arn
  target_id        = aws_instance.backend.id
  port             = 3001
}

resource "aws_lb_target_group_attachment" "consumer_attach" {
  target_group_arn = aws_lb_target_group.tg_consumer.arn
  target_id        = aws_instance.backend.id
  port             = 3002
}

resource "aws_lb_target_group_attachment" "meter_attach" {
  target_group_arn = aws_lb_target_group.tg_meter.arn
  target_id        = aws_instance.backend.id
  port             = 3003
}

resource "aws_lb_target_group_attachment" "billing_attach" {
  target_group_arn = aws_lb_target_group.tg_billing.arn
  target_id        = aws_instance.backend.id
  port             = 3004
}

resource "aws_lb_target_group_attachment" "alert_attach" {
  target_group_arn = aws_lb_target_group.tg_alert.arn
  target_id        = aws_instance.backend.id
  port             = 3005
}

# 5. Listener on Port 80
resource "aws_lb_listener" "http_listener" {
  load_balancer_arn = aws_lb.smartgrid_alb.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.tg_frontend.arn
  }
}

# 6. Listener Rules for Routing Requests to Backend
resource "aws_lb_listener_rule" "route_auth" {
  listener_arn = aws_lb_listener.http_listener.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.tg_auth.arn
  }

  condition {
    path_pattern {
      values = ["/api/auth*"]
    }
  }
}

resource "aws_lb_listener_rule" "route_consumer" {
  listener_arn = aws_lb_listener.http_listener.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.tg_consumer.arn
  }

  condition {
    path_pattern {
      values = ["/api/consumers*"]
    }
  }
}

resource "aws_lb_listener_rule" "route_meter" {
  listener_arn = aws_lb_listener.http_listener.arn
  priority     = 30

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.tg_meter.arn
  }

  condition {
    path_pattern {
      values = ["/api/meters*"]
    }
  }
}

resource "aws_lb_listener_rule" "route_billing" {
  listener_arn = aws_lb_listener.http_listener.arn
  priority     = 40

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.tg_billing.arn
  }

  condition {
    path_pattern {
      values = [
        "/api/bills*",
        "/api/tariffs*",
        "/api/recharges*"
      ]
    }
  }
}

resource "aws_lb_listener_rule" "route_alert" {
  listener_arn = aws_lb_listener.http_listener.arn
  priority     = 50

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.tg_alert.arn
  }

  condition {
    path_pattern {
      values = [
        "/api/alerts*",
        "/api/inspections*"
      ]
    }
  }
}
