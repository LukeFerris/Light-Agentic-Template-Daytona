output "project_name" {
  description = "Project name used for resource naming"
  value       = local.project_name
}

output "environment_id" {
  description = "Unique environment identifier for this deployment"
  value       = local.environment_id
}

output "app_url" {
  description = "Public URL for the application (frontend + same-origin API), served by the ALB"
  value       = "http://${aws_lb.main.dns_name}"
}

output "alb_dns_name" {
  description = "DNS name of the application load balancer"
  value       = aws_lb.main.dns_name
}

output "ecr_frontend_url" {
  description = "ECR repository URL for the frontend image"
  value       = aws_ecr_repository.frontend.repository_url
}

output "ecr_backend_url" {
  description = "ECR repository URL for the backend image"
  value       = aws_ecr_repository.backend.repository_url
}

output "cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "app_bucket_name" {
  description = "S3 bucket the application uses at runtime"
  value       = aws_s3_bucket.app.bucket
}

output "aws_region" {
  description = "AWS region"
  value       = var.aws_region
}
