terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  backend "local" {
    path = "terraform.tfstate"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = local.project_name
      Environment = local.environment_id
      ManagedBy   = "terraform"
    }
  }
}

# --- Environment ID & Project Name ---

resource "random_id" "environment" {
  byte_length = 4
}

locals {
  _raw_dir_name     = basename(abspath("${path.module}/.."))
  _sanitized_name   = replace(replace(lower(local._raw_dir_name), "/[^a-z0-9]/", "-"), "/-+/", "-")
  _truncated_name   = substr(local._sanitized_name, 0, 12)
  _trimmed_name     = replace(replace(local._truncated_name, "/^-+/", ""), "/-+$/", "")
  auto_project_name = local._trimmed_name != "" ? local._trimmed_name : "app"

  project_name    = var.project_name != "" ? var.project_name : local.auto_project_name
  environment_id  = var.environment_id != "" ? var.environment_id : random_id.environment.hex
  resource_prefix = "${local.project_name}-${local.environment_id}"

  # Until the deploy script builds and pushes the real images, fall back to a
  # tiny public image so `terraform apply` can stand up the stack. The normal
  # deploy path always supplies the pushed image refs, so this is only used by a
  # bare first apply / validate.
  backend_image  = var.backend_image != "" ? var.backend_image : "public.ecr.aws/docker/library/busybox:latest"
  frontend_image = var.frontend_image != "" ? var.frontend_image : "public.ecr.aws/docker/library/busybox:latest"

  # API routes served by the backend. The ALB forwards these to the backend
  # target group; everything else falls through to the frontend (the SPA). The
  # browser therefore reaches the API same-origin, so no CORS config is needed.
  backend_path_patterns = ["/hello", "/hello/*", "/storage", "/storage/*", "/health"]
}

resource "terraform_data" "persist_env_vars" {
  triggers_replace = [local.environment_id, local.project_name]

  provisioner "local-exec" {
    command = <<-EOT
      if ! grep -q 'environment_id' "${path.module}/terraform.tfvars" 2>/dev/null; then
        echo 'environment_id = "${local.environment_id}"' >> "${path.module}/terraform.tfvars"
      fi
      if ! grep -q 'project_name' "${path.module}/terraform.tfvars" 2>/dev/null; then
        echo 'project_name = "${local.project_name}"' >> "${path.module}/terraform.tfvars"
      fi
    EOT
  }
}

# --- Networking: reuse the account's default VPC ---
# Fargate tasks and the ALB run in the default VPC's public subnets with a public
# IP, so they can pull images from ECR and reach real AWS services (e.g. S3)
# without provisioning a NAT gateway.

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# --- ECR repositories (one per application image) ---

resource "aws_ecr_repository" "frontend" {
  name                 = "${local.resource_prefix}-frontend"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "backend" {
  name                 = "${local.resource_prefix}-backend"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

# --- S3 bucket the application uses at runtime (real S3 in place of the MinIO
# mock that stands in for it under docker compose) ---

resource "aws_s3_bucket" "app" {
  bucket = "${local.resource_prefix}-app"

  # Allow teardown to remove the bucket even if it still holds objects.
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "app" {
  bucket = aws_s3_bucket.app.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# --- CloudWatch log groups ---

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/ecs/${local.resource_prefix}/frontend"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${local.resource_prefix}/backend"
  retention_in_days = 7
}

# --- IAM roles ---

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Execution role: lets ECS pull images from ECR and write container logs.
resource "aws_iam_role" "task_execution" {
  name               = "${local.resource_prefix}-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Task role: the identity the backend container assumes at runtime. Grants
# access to the app S3 bucket via the standard credential provider chain, so the
# app talks to real S3 with no endpoint/credentials config.
resource "aws_iam_role" "task" {
  name               = "${local.resource_prefix}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

data "aws_iam_policy_document" "task_s3" {
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.app.arn]
  }
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.app.arn}/*"]
  }
}

resource "aws_iam_role_policy" "task_s3" {
  name   = "${local.resource_prefix}-s3"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_s3.json
}

# --- Security groups ---

resource "aws_security_group" "alb" {
  name        = "${local.resource_prefix}-alb"
  description = "Public ingress to the application load balancer"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP from the internet"
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
}

resource "aws_security_group" "service" {
  name        = "${local.resource_prefix}-svc"
  description = "Fargate service tasks"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "Frontend port from the ALB"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description     = "Backend port from the ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Allow tasks in this group to reach each other (service-to-service traffic via
  # Cloud Map service discovery).
  ingress {
    description = "Intra-service traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    self        = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# --- Application Load Balancer ---

resource "aws_lb" "main" {
  name               = "${local.resource_prefix}-alb"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnets.default.ids
}

resource "aws_lb_target_group" "frontend" {
  name        = "${local.resource_prefix}-fe"
  port        = 80
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.default.id
  target_type = "ip"

  health_check {
    path                = "/"
    matcher             = "200"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
  }
}

resource "aws_lb_target_group" "backend" {
  name        = "${local.resource_prefix}-be"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.default.id
  target_type = "ip"

  health_check {
    path                = "/health"
    matcher             = "200"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  # Default: serve the frontend SPA.
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

# Route the API paths to the backend; everything else falls through to the SPA.
resource "aws_lb_listener_rule" "backend" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    path_pattern {
      values = local.backend_path_patterns
    }
  }
}

# --- ECS cluster ---

resource "aws_ecs_cluster" "main" {
  name = local.resource_prefix
}

# --- Service discovery (Cloud Map) ---
# Registers the backend as `backend.<project>.local` inside the VPC, giving the
# frontend (and any future service) a stable internal name to reach it by.

resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "${local.project_name}.local"
  description = "Service discovery for ${local.project_name}"
  vpc         = data.aws_vpc.default.id
}

resource "aws_service_discovery_service" "backend" {
  name = "backend"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }
}

# --- Backend Fargate service ---

resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.resource_prefix}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.backend_cpu
  memory                   = var.backend_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = local.backend_image
      essential = true
      portMappings = [
        { containerPort = 3000, protocol = "tcp" }
      ]
      environment = [
        # No S3_ENDPOINT -> the app targets real AWS S3 (see s3Client.ts). The
        # task role supplies credentials.
        { name = "AWS_REGION", value = var.aws_region },
        { name = "S3_BUCKET", value = aws_s3_bucket.app.bucket },
        { name = "PORT", value = "3000" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.backend.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "backend"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "backend" {
  name            = "backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.service.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 3000
  }

  service_registries {
    registry_arn = aws_service_discovery_service.backend.arn
  }

  depends_on = [aws_lb_listener.http]
}

# --- Frontend Fargate service ---

resource "aws_ecs_task_definition" "frontend" {
  family                   = "${local.resource_prefix}-frontend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.frontend_cpu
  memory                   = var.frontend_memory
  execution_role_arn       = aws_iam_role.task_execution.arn

  container_definitions = jsonencode([
    {
      name      = "frontend"
      image     = local.frontend_image
      essential = true
      portMappings = [
        { containerPort = 80, protocol = "tcp" }
      ]
      environment = [
        # Empty API_URL -> the browser calls the API same-origin through the
        # ALB, which routes the API paths to the backend service.
        { name = "API_URL", value = "" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.frontend.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "frontend"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "frontend" {
  name            = "frontend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.service.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = 80
  }

  depends_on = [aws_lb_listener.http]
}
