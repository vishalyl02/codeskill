#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=========================================================="
echo " CodeSkill Infrastructure Deployment Script               "
echo " Target Directory: ${TERRAFORM_DIR}                     "
echo "=========================================================="

cd "${TERRAFORM_DIR}"

# 1. Pre-flight Checks
echo ""
echo "[1/5] Checking AWS credentials and configuration..."
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "✖ AWS credentials not detected. Please configure AWS CLI or export AWS_PROFILE / AWS_ACCESS_KEY_ID."
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
CURRENT_ARN=$(aws sts get-caller-identity --query Arn --output text)
echo "  ✔ Authenticated as: ${CURRENT_ARN} (Account: ${ACCOUNT_ID})"

if [ ! -f "terraform.tfvars" ]; then
    echo "  ! Note: terraform.tfvars not found. Creating from terraform.tfvars.example..."
    cp terraform.tfvars.example terraform.tfvars
    echo "  ✔ Created terraform.tfvars. Please review settings if needed."
fi

# 2. Validation
echo ""
echo "[2/5] Running validation..."
"${SCRIPT_DIR}/validate.sh"

# 3. Terraform Plan Generation
echo ""
echo "[3/5] Generating deployment plan (tfplan)..."
terraform plan -out=tfplan

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
    terraform apply tfplan
    echo "✔ Deployment finished successfully!"
else
    echo "Deployment cancelled by user. The plan file 'tfplan' remains available."
    exit 0
fi
