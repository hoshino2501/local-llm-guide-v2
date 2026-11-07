data "aws_caller_identity" "current" {}

locals {
  name       = "${var.project}-${var.environment}"
  use_domain = var.domain_name != ""
  use_r53    = local.use_domain && var.route53_zone_id != ""
  web_root   = "${path.module}/../../web"
  dist_dir   = "${path.module}/../../backend/dist"
}
