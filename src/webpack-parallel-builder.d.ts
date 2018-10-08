
import { Action } from './worker-actions'

export interface Log {
  idx: number
  data: string
  type: 'error' | 'log'
}

export interface Action {
  action: keyof (typeof Action)
}

export interface ProgressPayload extends Action {
  percent: number
  message: string
  step: string
  active: string
}

export interface MinimalStats {
  id: number
  pid: number
  errors: string[]
  warnings: string[]
  modules: string[]
  filteredModules: number
}

export interface EndPayload extends Action, MinimalStats { }
export interface WatchPayload extends Action, MinimalStats { }

export { Configuration as WebpackConfig, Stats } from 'webpack'
export { Configuration as DevServerConfiguration } from 'webpack-dev-server'