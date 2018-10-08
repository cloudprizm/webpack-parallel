import webpack from 'webpack'
import { isEmpty, pipe } from 'ramda'
import { interval, merge, Subject } from 'rxjs'
import { buffer, distinctUntilChanged } from 'rxjs/operators'
import { Action } from './worker-actions'

const sendMessage = msg => process.send(msg)

const mkProgressPayload = (percent, message, step, active) =>
  ({ percent, message, step, active, action: Action.progress })

const mkEndPayload = (stats = {}) =>
  ({ ...stats, action: Action.end })

const mkWatchPayload = (stats = {}) =>
  ({ ...stats, action: Action.watch })

// INFO: runner is accepting array of events
const sendEndAction = pipe(mkEndPayload, Array.of, sendMessage)

const notifyAboutSomethingUnexpected = (error) => {
  console.error(error.message)

  sendEndAction({
    errors: [`${error.message}\n${error.stack}`],
    warnings: []
  })
}

const runAsSingleCompilation = (config) => new Promise((res) => {
  const { progress, watcher: end } = getStreamsForwarders()

  config.plugins.push(new webpack.ProgressPlugin((...args) =>
    progress.next(mkProgressPayload(...args))
  ))

  webpack(config)
    .run((err, stats) => {
      if (err) throw new Error(err)
      end.next(mkEndPayload(stats.toJson('minimal')))
      res()
    })
})

const progressCompare = (a, b) =>
  a.percent === b.percent && a.step === b.step && a.message === b.message

const getStreamsForwarders = () => {
  const progress = new Subject()
  const watcher = new Subject()

  const all = merge(
    progress.pipe(distinctUntilChanged(progressCompare)),
    watcher.pipe(distinctUntilChanged()),
  ).pipe(buffer(interval(100)))

  const subscriber = all.subscribe((data) => !isEmpty(data) && process.send(data))
  return {
    progress,
    watcher,
    subscriber
  }
}

const runAsWatcher = (config) => new Promise(() => {
  config.watch = true
  const watchOptions = {
    aggregateTimeout: 500,
    poll: 500,
  }

  const { progress, watcher } = getStreamsForwarders()

  config.plugins.push(new webpack.ProgressPlugin((...args) =>
    progress.next(mkProgressPayload(...args))
  ))

  webpack(config)
    .watch(watchOptions, (err, stats) => {
      if (err) throw new Error(err)

      progress.next(mkProgressPayload(1, 'done'))
      watcher.next(mkWatchPayload(stats.toJson('minimal')))
    })
})

export const runWebpack = ({ path, workerIndex, watch }) => {
  const configs = require(path)
  const isPromise = !!configs.default.then
  const promiseRun = isPromise ? configs.default : Promise.resolve(configs.default)

  process
    .on('unhandledRejection', notifyAboutSomethingUnexpected)
    .on('uncaughtException', notifyAboutSomethingUnexpected)

  return promiseRun
    .then(configs => configs[workerIndex])
    .then(config => watch ? runAsWatcher(config) : runAsSingleCompilation(config))
}