import webpack from 'webpack'
import { isEmpty, pipe } from 'ramda'
import { interval, merge, Subject } from 'rxjs'
import { buffer, distinctUntilChanged } from 'rxjs/operators'
import { Worker } from 'cluster'
import Server from 'webpack-dev-server/lib/Server'
import { Overwrite } from 'utility-types'
import {
  Action,
  WebpackConfig,
  GenericAction,
  WebpackWorkerInput,
  getFreePort,
  EndPayload,
  WatchPayload,
  ProgressPayload,
  resolveConfigFromFile,
} from './worker-actions'

import { withDevServerPort } from '@hungry/webpack-parts'

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

const runAsSingleCompilation = (config: WebpackConfig) => new Promise((res, rej) => {
  const { progress, watcher: end, all } = getStreamsForwarders<ProgressPayload, EndPayload>()
  const subscriber = all.subscribe((data: Array<Partial<GenericAction>>) => !isEmpty(data) && sendMessage(data))

  if (!config.plugins) config.plugins = []

  config.plugins.push(new webpack.ProgressPlugin((...args) => {
    progress.next(mkProgressPayload(...args))
  }
  ))

  webpack(config)
    .run((err, stats) => {
      if (err) return rej(err)
      end.next(mkEndPayload(stats.toJson('minimal')))

      res(stats)
      setImmediate(subscriber.unsubscribe)
    })
})

const runAsWatcher = (config: WebpackConfig) => new Promise((res, rej) => {
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
      if (err) rej(err)

      progress.next(mkProgressPayload(1, 'done'))
      watcher.next(mkWatchPayload(stats.toJson('minimal')))

      res(stats)
      setImmediate(subscriber.unsubscribe)
    })
})

type WebpackDevServer = Required<Pick<WebpackConfig, 'devServer'>>
type WithDevServer = Overwrite<WebpackConfig, WebpackDevServer>

const getPortIfNotDefined = (config: WithDevServer) =>
  Promise.resolve<WithDevServer>(
    config.devServer.port
      ? config
      // TODO think about fliping args to make this cleaner
      : getFreePort().then(ports =>
        withDevServerPort.set(ports[0])(config) as WithDevServer
      )
  )

const runAsServer = (input: WithDevServer) =>
  getPortIfNotDefined(input)
    .then(config => new Promise((res, rej) => {
      config.watch = true
      const { progress, all } = getStreamsForwarders<ProgressPayload, WatchPayload>()
      all.subscribe((data: Array<Partial<GenericAction>>) => !isEmpty(data) && sendMessage(data))

      if (!config.plugins) config.plugins = []

      config.plugins.push(new webpack.ProgressPlugin((...args) =>
        progress.next(mkProgressPayload(...args))
      ))

      const compiler = webpack(config)
      const { port } = config.devServer
      const server = new Server(compiler)

      server.listen(port, 'localhost', (err) => {
        console.log('running server', err)
        if (err) {
          throw err
        }
      })
    })
    )

process
  .on('unhandledRejection', notifyAboutSomethingUnexpected)
  .on('uncaughtException', notifyAboutSomethingUnexpected)

export const runWebpack = ({ config: inputConfig, workerIndex, watch }: WebpackWorkerInput) =>
  resolveConfigFromFile(inputConfig)
    .then((configs: WebpackConfig[]) => configs[workerIndex])
    .then((config: WebpackConfig) =>
      !watch
        ? runAsSingleCompilation(config)
        : !config.devServer || isEmpty(config.devServer)
          ? runAsWatcher(config)
          : runAsServer(config as WithDevServer)
    )