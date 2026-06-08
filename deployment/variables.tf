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

variable "lambda_runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs20.x"
}

variable "lambda_memory_size" {
  description = "Lambda memory in MB"
  type        = number
  default     = 128
}

variable "lambda_timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 10
}

variable "api_stage_name" {
  description = "API Gateway stage name"
  type        = string
  default     = "prod"
}
