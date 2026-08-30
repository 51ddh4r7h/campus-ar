# Deployment

All AWS, all free tier. Region `ap-south-1` (Mumbai).

| Piece | Service | Free tier |
| --- | --- | --- |
| API | Lambda (Node 22, arm64) behind API Gateway **HTTP API** | Lambda 1M req/mo always free · HTTP API 1M req/mo (first 12 mo) |
| Data | **DynamoDB** — one table, on-demand | 25 GB always free |
| Site | **S3 + CloudFront** (HTTPS via CloudFront) | CloudFront 1 TB/mo always free · S3 5 GB (first 12 mo) |
| Provisioning | one CloudFormation/SAM template | — |

The whole stack is `infra/template.yaml`. `aws cloudformation deploy` runs the
SAM transform server-side, so no SAM CLI is needed — just the AWS CLI.

## First deploy

```bash
# 1. API + all infrastructure (DynamoDB, Lambda, HTTP API, S3, CloudFront)
npm run deploy:api

# 2. build the client against the new API URL and publish it
npm run deploy:client
```

`deploy:api` prints the stack outputs — `ApiUrl`, `SiteUrl`, `SiteBucketName`,
`DistributionId`, `TableName`. The first run creates the CloudFront distribution,
which takes ~10–15 minutes to finish rolling out even after the command returns.

To require an admin key on `/admin/*` routes:

```bash
ADMIN_KEY='something-long' npm run deploy:api
```

## Redeploys

```bash
npm run deploy:api      # rebuilds the bundle, updates the Lambda
npm run deploy:client   # rebuilds the client, syncs S3, invalidates CloudFront
npm run deploy          # both
```

Overrides: `STACK=<name>` and `AWS_REGION=<region>` on any deploy command.

## Local development

No AWS needed — the dev API uses an in-memory store:

```bash
npm run dev:api      # http://localhost:8787
npm run dev:client   # http://localhost:5173  (proxies /api → :8787)
```

## Tear down

```bash
aws s3 rm s3://<SiteBucketName> --recursive
aws cloudformation delete-stack --stack-name campus-movie-hunt --region ap-south-1
```

## Notes

- DynamoDB single-table layout is documented at the top of
  `api/src/dynamo-store.ts`.
- Live standings are polled by the client (`GET /standings/:batchId`), not
  pushed. Fine for a batch of ~40 players.
- The Lambda bundle externalises `@aws-sdk/*` — the Node 22 runtime ships it.
