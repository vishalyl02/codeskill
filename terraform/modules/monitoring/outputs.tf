output "sns_topic_arn" {
  description = "ARN of the SNS topic for infrastructure alert notifications"
  value       = aws_sns_topic.alerts.arn
}

output "grafana_port" {
  description = "Port for Grafana OSS web portal"
  value       = 3001
}

output "uptime_kuma_port" {
  description = "Port for Uptime Kuma HTTP monitoring portal"
  value       = 3002
}

output "prometheus_port" {
  description = "Port for Prometheus server"
  value       = 9090
}

output "loki_port" {
  description = "Port for Loki log aggregation endpoint"
  value       = 3100
}

output "monitoring_stack_summary" {
  description = "Summary of active open-source monitoring components"
  value       = "Prometheus (v2.48), Grafana OSS (v10.3), Loki (v2.9), Promtail, Node Exporter, PostgreSQL Exporter, Uptime Kuma"
}

# Compatibility output for legacy references
output "dashboard_name" {
  description = "Legacy compatibility identifier"
  value       = "codeskill-oss-grafana"
}
