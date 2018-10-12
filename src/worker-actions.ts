import { Configuration as WebpackConfig } from 'webpack'

export enum Action {
  start = 'start',
  progress = 'progress',
  watch = 'watch',
  end = 'end'
}

export interface AnnotatedByMaster {
  id?: number
  idx?: number
  pid?: number
}
export interface Log {
  idx: number
  data: string
  type: 'error' | 'log'
}

export interface GenericAction extends AnnotatedByMaster {
  action: Action
}
export interface ProgressPayload extends GenericAction {
  moduleName: string
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

export interface EndPayload extends Required<GenericAction>, MinimalStats {
  action: Action.end
}

export interface WatchPayload extends Required<GenericAction>, MinimalStats {
  action: Action.watch
}

export { Configuration as WebpackConfig, Stats } from 'webpack'
export { Configuration as DevServerConfiguration } from 'webpack-dev-server'


export interface RunnerInput {
  config: string
  cwd: string
  workerFile: string
  fullReport: boolean
  watch: boolean
  silent: boolean
}

export type ExternalWebpackConfig = WebpackConfig | WebpackConfig[]
export type WorkerInput = Required<Pick<RunnerInput, 'workerFile' | 'watch' | 'cwd' | 'config'>>

export interface WebpackWorkerInput {
  path: string
  workerIndex: number
  watch: boolean
}
