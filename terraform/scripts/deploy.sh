#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$(cd "${SCRIPT_DIR}/../environments/production" && pwd)"

echo "=========================================================="
echo " CodeSkill Infrastructure Deployment Script               "
echo " Target Directory: ${TERRAFORM_DIR}                     "
echo "=========================================================="

cd "${TERRAFORM_DIR}"

# 1. Pre-flight Checks
echo ""
echo "[1/5] Checking AWS credentials and configuration..."
if ! ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text); then
    echo "✖ AWS credentials not detected. Please configure AWS CLI or export AWS_PROFILE / AWS_ACCESS_KEY_ID."
    exit 1
fi

if [[ "$ACCOUNT_ID" != "239939507154" ]]; then
    echo "✖ Expected CodeSkill production AWS account 239939507154, got ${ACCOUNT_ID}." >&2
    exit 1
fi

if ! state_addresses=$(terraform state list) ||
    ! grep -Fxq 'module.alb.aws_lb.main' <<< "$state_addresses" ||
    ! grep -Fxq 'module.waf.aws_wafv2_web_acl.main' <<< "$state_addresses"; then
    echo "✖ The selected Terraform state does not contain the production ALB and Web ACL." >&2
    echo "  Initialize this directory with the existing production backend and select its workspace, then retry." >&2
    exit 1
fi

# 2. Validation
echo ""
echo "[2/5] Running validation..."
"${SCRIPT_DIR}/validate.sh" "$TERRAFORM_DIR"

# 3. Terraform Plan Generation
echo ""
echo "[3/5] Generating deployment plan (production.tfplan)..."
umask 077
terraform plan -out=production.tfplan

# 4. Plan Summary
echo ""
echo "[4/5] Plan generated successfully."
echo "Review the above resource changes carefully."

# 5. Safety Prompt
echo ""
echo "[5/5] Deployment Confirmation"
echo "SAFETY GUARANTEE: Automatic execution is prohibited."
echo "To apply this plan to AWS production, type 'YES' (in capitals):"
read -r CONFIRMATION

if [ "${CONFIRMATION}" == "YES" ]; then
    echo "Applying Terraform plan..."
    terraform apply production.tfplan
    echo "✔ Deployment finished successfully!"
else
    echo "Deployment cancelled by user. The plan file 'production.tfplan' remains available."
    exit 0
fi
