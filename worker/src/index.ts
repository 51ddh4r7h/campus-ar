import {createApp} from './app'
import {D1Store} from './d1-store'
import type {Env} from './env'

export default createApp((env: Env) => new D1Store(env.DB))
