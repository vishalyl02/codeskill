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
