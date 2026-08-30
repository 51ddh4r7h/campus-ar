import {handle} from 'hono/aws-lambda'
import {createApp} from './app'
import {DynamoStore} from './dynamo-store'
import {envFromProcess} from './env'

const env = envFromProcess()
const store = new DynamoStore(env.tableName, process.env.AWS_REGION)

export const handler = handle(createApp(store, env))
