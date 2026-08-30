#!/usr/bin/env bash
# Build the Lambda bundle and deploy the API + infrastructure stack.
#   AWS_REGION and STACK can be overridden; ADMIN_KEY is optional.
set -euo pipefail
cd "$(dirname "$0")/.."

STACK=${STACK:-campus-movie-hunt}
REGION=${AWS_REGION:-ap-south-1}

echo "→ building api bundle"
npm run build --workspace api

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ARTIFACTS="cmh-deploy-${ACCOUNT}-${REGION}"

if ! aws s3api head-bucket --bucket "$ARTIFACTS" 2>/dev/null; then
  echo "→ creating artifact bucket $ARTIFACTS"
  aws s3 mb "s3://$ARTIFACTS" --region "$REGION"
fi

echo "→ deploying stack '$STACK' in $REGION"

deploy_args=(
  --template-file infra/template.yaml
  --stack-name "$STACK"
  --region "$REGION"
  --capabilities CAPABILITY_IAM
  --s3-bucket "$ARTIFACTS"
  --s3-prefix "$STACK"
  --no-fail-on-empty-changeset
)
if [[ -n "${ADMIN_KEY:-}" ]]; then
  deploy_args+=(--parameter-overrides "AdminKey=$ADMIN_KEY")
fi

aws cloudformation deploy "${deploy_args[@]}"

echo
aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs" --output table
