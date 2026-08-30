#!/usr/bin/env bash
# Build the Svelte client against the deployed API and publish it to S3 + CloudFront.
# Run scripts/deploy-api.sh first (this reads the stack outputs).
set -euo pipefail
cd "$(dirname "$0")/.."

STACK=${STACK:-campus-movie-hunt}
REGION=${AWS_REGION:-ap-south-1}

out() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

API_URL=$(out ApiUrl)
BUCKET=$(out SiteBucketName)
DIST=$(out DistributionId)
SITE=$(out SiteUrl)

echo "→ building client against $API_URL"
VITE_API_BASE="$API_URL" npm run build --workspace client

echo "→ syncing to s3://$BUCKET"
aws s3 sync client/dist "s3://$BUCKET" --delete --region "$REGION"

echo "→ invalidating CloudFront $DIST"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths '/*' >/dev/null

echo
echo "Live → $SITE"
