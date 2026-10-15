output "judge_instance_id" { value = module.shared_judges.instance_id }
output "judge0_url" { value = module.shared_judges.judge0_url }
output "piston_url" { value = var.deployment_mode == "separate" ? module.piston[0].piston_url : module.shared_judges.piston_url }
output "judge0_token_parameter" { value = module.shared_judges.judge0_token_parameter }
output "piston_token_parameter" { value = var.deployment_mode == "separate" ? module.piston[0].judge0_token_parameter : module.shared_judges.judge0_token_parameter }
output "piston_instance_id" { value = var.deployment_mode == "separate" ? module.piston[0].instance_id : module.shared_judges.instance_id }
