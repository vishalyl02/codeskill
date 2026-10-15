#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=========================================================="
echo " CodeSkill Infrastructure Emergency Rollback Utility      "
echo " Working Directory: ${TERRAFORM_DIR}                     "
echo "=========================================================="

cd "${TERRAFORM_DIR}"

echo ""
echo "Select an emergency rollback operation:"
echo "  1) Rollback Application ASG to Previous Launch Template Version"
echo "  2) Cancel Running ASG Instance Refresh"
echo "  3) Emergency Scale-Down (Set Desired = Min Capacity)"
echo "  4) List Latest PostgreSQL RDS Automated Snapshots"
echo "  5) Rollback Terraform State to Previous Commit"
echo "  6) Exit"
echo ""
read -p "Enter choice [1-6]: " CHOICE

case "${CHOICE}" in
    1)
        APP_ASG=$(terraform output -raw app_asg_name 2>/dev/null || echo "")
        if [ -z "$APP_ASG" ]; then
            read -p "Enter Application AutoScalingGroupName: " APP_ASG
        fi
        echo "Initiating rollback instance refresh for $APP_ASG..."
        aws autoscaling rollback-instance-refresh --auto-scaling-group-name "$APP_ASG" || {
            echo "Direct rollback not available; rolling refresh with previous launch template version..."
            LT_ID=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$APP_ASG" --query "AutoScalingGroups[0].LaunchTemplate.LaunchTemplateId" --output text)
            PREV_VER=$(aws ec2 describe-launch-template-versions --launch-template-id "$LT_ID" --query "LaunchTemplateVersions[-2].VersionNumber" --output text || echo "1")
            echo "Updating ASG to use Launch Template Version: $PREV_VER"
            aws autoscaling update-auto-scaling-group --auto-scaling-group-name "$APP_ASG" --launch-template "LaunchTemplateId=$LT_ID,Version=$PREV_VER"
            aws autoscaling start-instance-refresh --auto-scaling-group-name "$APP_ASG" --preferences '{"MinHealthyPercentage": 50, "InstanceWarmup": 300}'
        }
        echo "✔ Rollback instance refresh initiated."
        ;;
    2)
        APP_ASG=$(terraform output -raw app_asg_name 2>/dev/null || echo "")
        if [ -z "$APP_ASG" ]; then
            read -p "Enter Application AutoScalingGroupName: " APP_ASG
        fi
        echo "Cancelling active instance refresh on $APP_ASG..."
        aws autoscaling cancel-instance-refresh --auto-scaling-group-name "$APP_ASG"
        echo "✔ Instance refresh cancelled."
        ;;
    3)
        APP_ASG=$(terraform output -raw app_asg_name 2>/dev/null || echo "")
        if [ -z "$APP_ASG" ]; then
            read -p "Enter Application AutoScalingGroupName: " APP_ASG
        fi
        echo "Scaling $APP_ASG down to 1 instance..."
        aws autoscaling update-auto-scaling-group --auto-scaling-group-name "$APP_ASG" --desired-capacity 1
        echo "✔ Scaled down."
        ;;
    4)
        DB_ID=$(terraform output -raw rds_database_name 2>/dev/null || echo "codeskill-prod-postgres")
        echo "Listing automated RDS snapshots for $DB_ID..."
        aws rds describe-db-snapshots --snapshot-type automated --query "DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime,Status]" --output table
        echo ""
        echo "To restore an RDS snapshot without downtime:"
        echo "  aws rds restore-db-instance-from-db-snapshot \\"
        echo "    --db-instance-identifier <new-restored-db-name> \\"
        echo "    --db-snapshot-identifier <snapshot-id> \\"
        echo "    --db-subnet-group-name <subnet-group>"
        ;;
    5)
        echo "To rollback Terraform to a previous git commit:"
        echo "  git log -n 5 --oneline"
        echo "  git checkout <commit-hash> -- terraform/"
        echo "  terraform plan -out=tfplan"
        echo "  terraform apply tfplan"
        ;;
    *)
        echo "Exiting without changes."
        exit 0
        ;;
esac
