import { Configuration as WebpackConfig } from 'webpack'
import {
  all,
  equals,
  length,
  prop,
  range,
  toPairs,
  map,
  pipe,
  view,
  lensIndex,
  zip,
  fromPairs,
  KeyValuePair,
} from 'ramda'

export enum Action {
  start = 'start',
  progress = 'progress',
  watch = 'watch',
  end = 'end'
}

export interface AnnotatedByMaster {
  id: number
  idx: number
  pid: number
  name?: string
}
export interface Log extends AnnotatedByMaster {
  idx: number
  data: string
  type: 'error' | 'log'
}

export interface GenericAction extends AnnotatedByMaster {
  action: Action
}

export type WorkerEvents = GenericAction[]
export interface ProgressPayload extends GenericAction {
  moduleName: string
  percent: number
  message: string
  step: string
  active: string
}

export interface MinimalStats extends GenericAction {
  id: number
  pid: number
  errors: string[]
  warnings: string[]
  modules: string[]
  filteredModules: number
}

export interface EndPayload extends GenericAction, MinimalStats {
  action: Action.end
}

export interface WatchPayload extends GenericAction, MinimalStats {
  action: Action.watch
}

export { Configuration as WebpackConfig, Stats } from 'webpack'

export interface RunnerInput {
  config: string
  cwd: string
  workerFile: string
  fullReport: boolean
  watch: boolean
  silent: boolean
  server: boolean
}

export type ExternalWebpackConfig = WebpackConfig | WebpackConfig[]
export type WorkerInput = Required<Pick<RunnerInput, 'workerFile' | 'watch' | 'cwd' | 'config' | 'server'>>

export interface WebpackWorkerInput {
  config: string
  processCwd: string
  workerIndex: number
  watch: boolean
  server: boolean
}

export type Configs = KeyValuePair<string, WebpackConfig>

export const first = view(lensIndex(0))
export const second = view(lensIndex(1))
export const third = view(lensIndex(2))
export const fourth = view(lensIndex(3))

export const getConfigDefaultNames = (friendlyNames: string[] | undefined, count: number) =>
  friendlyNames
    ? friendlyNames
    : range(0, count).map(x => `C${x}`)

export const resolveConfigFromFileWithNames = (configPath: string): Promise<Configs> => {
  const config = require(configPath)
  const friendlyNames = config.configNames

  const isPromise = !!config.default.then
  return (isPromise ? config.default : Promise.resolve(config.default))
    .then((c: ExternalWebpackConfig) => Array.isArray(c) ? c : [c])
    .then((configs: WebpackConfig[]) =>
      fromPairs<WebpackConfig>(
        zip<string, WebpackConfig>(
          getConfigDefaultNames(friendlyNames, configs.length), configs))
    )
}

export const resolveConfigFromFile = (configPath: string): Promise<WebpackConfig[]> =>
  resolveConfigFromFileWithNames(configPath)
    .then(pipe(toPairs, map(second)))

export const errorsCount = pipe(
  prop<'errors', string[]>('errors'),
  length,
)

export const noErrorsInStats: (input: EndPayload[]) => boolean = pipe(
  map(errorsCount),
  all(equals(0))
)
