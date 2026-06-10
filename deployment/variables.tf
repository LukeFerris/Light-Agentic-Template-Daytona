variable "environment_id" {
  description = "Unique environment identifier. Auto-generated on first deploy if not set."
  type        = string
  default     = ""
}

variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short project name prefix for resource naming (max 12 chars). Leave empty to auto-derive from repo directory name."
  type        = string
  default     = ""

  validation {
    condition     = var.project_name == "" || (length(var.project_name) >= 1 && length(var.project_name) <= 12 && can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?$", var.project_name)))
    error_message = "project_name must be 1-12 characters, lowercase alphanumeric and hyphens only, and cannot start or end with a hyphen."
  }
}

# --- Container images ---
# The deploy script builds and pushes the immutable application images to the
# ECR repositories created by this stack, then re-applies with the pushed image
# references so Fargate runs the exact artifacts that were smoke-tested. Left
# empty, the ECS services are created with a placeholder so a first `terraform
# apply` (before any image exists) can stand up the rest of the stack.

variable "frontend_image" {
  description = "Fully-qualified frontend image reference (ECR repo URL + tag) to run on Fargate. Set by the deploy script after build+push."
  type        = string
  default     = ""
}

variable "backend_image" {
  description = "Fully-qualified backend image reference (ECR repo URL + tag) to run on Fargate. Set by the deploy script after build+push."
  type        = string
  default     = ""
}

# --- Fargate task sizing ---

variable "backend_cpu" {
  description = "Fargate CPU units for the backend task (256 = 0.25 vCPU)"
  type        = number
  default     = 256
}

variable "backend_memory" {
  description = "Fargate memory (MB) for the backend task"
  type        = number
  default     = 512
}

variable "frontend_cpu" {
  description = "Fargate CPU units for the frontend task (256 = 0.25 vCPU)"
  type        = number
  default     = 256
}

variable "frontend_memory" {
  description = "Fargate memory (MB) for the frontend task"
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Number of running tasks per service"
  type        = number
  default     = 1
}
