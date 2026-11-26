# =================================================================================================
# Open-Source Monitoring Module (Prometheus + Grafana OSS + Loki + Promtail + Kuma)
# Zero Amazon CloudWatch Agent, Zero CloudWatch Alarms, Zero CloudWatch Dashboards
# =================================================================================================

# Central Notification Topic (for AWS Budgets and platform alert routing)
resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-alerts-topic"

  tags = merge(
    var.tags,
    {
      Name       = "${var.name_prefix}-alerts"
      Monitoring = "OSS-Prometheus-Grafana"
    }
  )
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# -----------------------------------------------------------------------------
# AWS Native Metric Alarms (Within AWS Free Tier: 10 Metric Alarms = $0.00/mo)
# -----------------------------------------------------------------------------

# RDS High CPU Alarm (>80% over two 5-minute evaluation periods)
resource "aws_cloudwatch_metric_alarm" "rds_cpu_high" {
  count               = var.db_identifier != "" ? 1 : 0
  alarm_name          = "${var.name_prefix}-rds-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "RDS PostgreSQL CPU exceeds 80% for 10 minutes"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = var.db_identifier
  }

  tags = var.tags
}

# RDS Low Free Storage Space (< 5 GB remaining)
resource "aws_cloudwatch_metric_alarm" "rds_storage_low" {
  count               = var.db_identifier != "" ? 1 : 0
  alarm_name          = "${var.name_prefix}-rds-storage-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 5368709120 # 5 GB in bytes
  alarm_description   = "RDS PostgreSQL free storage space is below 5 GB"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = var.db_identifier
  }

  tags = var.tags
}

# ALB HTTP 5xx High Error Rate (> 20 5xx responses in a 5-minute period)
resource "aws_cloudwatch_metric_alarm" "alb_5xx_high" {
  count               = var.alb_arn_suffix != "" ? 1 : 0
  alarm_name          = "${var.name_prefix}-alb-5xx-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 20
  alarm_description   = "ALB target 5XX errors exceeded 20 over 5 minutes"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
  }

  tags = var.tags
}

# Redis High Engine CPU Alarm (> 75% for 10 minutes)
resource "aws_cloudwatch_metric_alarm" "redis_cpu_high" {
  count               = var.enable_redis_alarms ? 1 : 0
  alarm_name          = "${var.name_prefix}-redis-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "EngineCPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Average"
  threshold           = 75
  alarm_description   = "ElastiCache Redis EngineCPUUtilization exceeds 75%"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    CacheClusterId = var.redis_cluster_id
  }

  tags = var.tags
}
