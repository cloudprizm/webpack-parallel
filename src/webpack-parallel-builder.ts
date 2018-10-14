import webpack from 'webpack'
import { isEmpty, pipe } from 'ramda'
import { interval, merge, Subject } from 'rxjs'
import { buffer, distinctUntilChanged } from 'rxjs/operators'
import { Worker } from 'cluster'
import {
  Action,
  WebpackConfig,
  GenericAction,
  WebpackWorkerInput,
  EndPayload,
  WatchPayload,
  ProgressPayload
} from './worker-actions'

const sendMessage = (msg: Array<Partial<GenericAction>>) => ((process as unknown) as Worker).send(msg)

const mkProgressPayload =
  (percent?: number, message?: string, step?: string, active?: string, moduleName?: string): Partial<ProgressPayload> =>
    ({ percent, message, step, active, moduleName, action: Action.progress })

const mkEndPayload = (stats = {}): Partial<EndPayload> =>
  ({ ...stats, action: Action.end })

const mkWatchPayload = (stats = {}): Partial<WatchPayload> =>
  ({ ...stats, action: Action.watch })

// INFO: runner is accepting array of events
const sendEndAction = pipe(mkEndPayload, Array.of, sendMessage)

const notifyAboutSomethingUnexpected = (error: Error) => {
  console.error(error.message)

  sendEndAction({
    errors: [`${error.message}\n${error.stack}`],
    warnings: []
  })
}

const runAsSingleCompilation = (config: WebpackConfig) => new Promise((res) => {
  const { progress, watcher: end, all } = getStreamsForwarders<ProgressPayload, EndPayload>()
  const subscriber = all.subscribe((data: Array<Partial<GenericAction>>) => !isEmpty(data) && sendMessage(data))

  if (!config.plugins) config.plugins = []

  config.plugins.push(new webpack.ProgressPlugin((...args) =>
    progress.next(mkProgressPayload(...args))
  ))

  webpack(config)
    .run((err, stats) => {
      if (err) throw err
      end.next(mkEndPayload(stats.toJson('minimal'))) // cool error!
      subscriber.unsubscribe()
      res()
    })
})

const progressCompare = (a: Partial<ProgressPayload>, b: Partial<ProgressPayload>) =>
  a.percent === b.percent && a.step === b.step && a.message === b.message

const getStreamsForwarders = <K, T>() => {
  const progress = new Subject<Partial<K>>()
  const watcher = new Subject<Partial<T>>()
  const all = merge(
    progress.pipe(distinctUntilChanged(progressCompare)),
    watcher.pipe(distinctUntilChanged()),
  ).pipe(buffer(interval(100)))

  return {
    progress,
    watcher,
    all
  }
}

const runAsWatcher = (config: WebpackConfig) => new Promise(() => {
  config.watch = true
  const watchOptions = {
    aggregateTimeout: 500,
    poll: 500,
  }
  const { progress, watcher, all } = getStreamsForwarders<ProgressPayload, WatchPayload>()
  const subscriber = all.subscribe((data: Array<Partial<GenericAction>>) => !isEmpty(data) && sendMessage(data))

  if (!config.plugins) config.plugins = []

  config.plugins.push(new webpack.ProgressPlugin((...args) =>
    progress.next(mkProgressPayload(...args))
  ))

  webpack(config)
    .watch(watchOptions, (err, stats) => {
      if (err) throw err

      progress.next(mkProgressPayload(1, 'done'))
      watcher.next(mkWatchPayload(stats.toJson('minimal')))
      subscriber.unsubscribe()
    })
})

export const runWebpack = ({ config, workerIndex, watch }: WebpackWorkerInput) => {
  const configs = require(config)
  const isPromise = !!configs.default.then
  const promiseRun = isPromise ? configs.default : Promise.resolve(configs.default)

  process
    .on('unhandledRejection', notifyAboutSomethingUnexpected)
    .on('uncaughtException', notifyAboutSomethingUnexpected)

  return promiseRun
    .then((configs: WebpackConfig[]) => configs[workerIndex])
    .then((config: WebpackConfig) => watch ? runAsWatcher(config) : runAsSingleCompilation(config))
}