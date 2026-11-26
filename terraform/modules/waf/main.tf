terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

resource "aws_wafv2_web_acl" "main" {
  name        = "${var.name_prefix}-waf"
  description = "WAF for ${var.name_prefix}"
  scope       = var.scope

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"

        # The ALB WAF inspects only 8 KiB of a body. Authenticated file uploads and
        # validated import batches legitimately exceed that size; retain every
        # other managed rule and handle this size label below by request path.
        rule_action_override {
          name = "SizeRestrictions_BODY"
          action_to_use {
            count {}
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = false
      metric_name                = "AWSManagedRulesCommonRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }

  # Keep the managed body-size restriction for all routes except the bounded,
  # authenticated bulk imports and the exact placement PDF POST route. Limits are enforced
  # by the application after the ALB forwards the request.
  rule {
    name     = "BlockOversizeBodyOutsideBulkImport"
    priority = 2

    action {
      block {}
    }

    statement {
      and_statement {
        statement {
          label_match_statement {
            scope = "LABEL"
            key   = "awswaf:managed:aws:core-rule-set:SizeRestrictions_Body"
          }
        }

        statement {
          not_statement {
            statement {
              regex_match_statement {
                # Preview is POST /import (there is no /import/preview route).
                # Anchor the exception so unrelated admin URLs stay protected.
                regex_string = "^/api/admin/(students/import(/confirm)?|questions/import(/(confirm|auto))?|placements(/.*)?)/?$"
                field_to_match {
                  uri_path {}
                }
                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }
          }
        }

        # Exclude only the exact PDF upload route and method from this size
        # label block. All other managed rules and NestJS validation still run.
        statement {
          not_statement {
            statement {
              and_statement {
                statement {
                  regex_match_statement {
                    regex_string = "^/api/placements/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/documents/?$"
                    field_to_match {
                      uri_path {}
                    }
                    text_transformation {
                      priority = 0
                      type     = "NONE"
                    }
                  }
                }
                statement {
                  byte_match_statement {
                    positional_constraint = "EXACTLY"
                    search_string         = "POST"
                    field_to_match {
                      method {}
                    }
                    text_transformation {
                      priority = 0
                      type     = "NONE"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = false
      metric_name                = "BlockOversizeBodyOutsideBulkImportMetric"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = false
    metric_name                = "${var.name_prefix}-waf-main-metric"
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_association" "alb" {
  count        = var.scope == "REGIONAL" && var.alb_arn != "" ? 1 : 0
  resource_arn = var.alb_arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}
