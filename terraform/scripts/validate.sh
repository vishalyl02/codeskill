#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=========================================================="
echo " Running CodeSkill Terraform Infrastructure Validation    "
echo " Working Directory: ${TERRAFORM_DIR}                     "
echo "=========================================================="

cd "${TERRAFORM_DIR}"

# 1. Format Check
echo ""
echo "[1/4] Checking Terraform formatting..."
if terraform fmt -check -recursive; then
    echo "✔ Terraform code is properly formatted."
else
    echo "✖ Formatting errors found! Run 'terraform fmt -recursive' to fix."
    exit 1
fi

# 2. Syntax Validation of User Data Templates
echo ""
echo "[2/4] Validating User Data shell templates syntax..."
for tpl in userdata/*.tftpl; do
    if [ -f "$tpl" ]; then
        echo "  - Checking $tpl..."
        # Replace Terraform interpolation strings like ${...} with dummy strings to test bash syntax
        sed 's/\${[^}]*}/DUMMY/g' "$tpl" | bash -n
        echo "    ✔ $tpl syntax valid."
    fi
done

# 3. Terraform Initialization
echo ""
echo "[3/4] Initializing Terraform providers and modules..."
terraform init -backend=false

# 4. Terraform Validation
echo ""
echo "[4/4] Validating Terraform configuration..."
if terraform validate; then
    echo ""
    echo "=========================================================="
    echo " ✔ All Terraform configurations are valid and production-ready!"
    echo "=========================================================="
else
    echo "✖ Terraform validation failed!"
    exit 1
fi
