import React from 'react'
import { render } from 'ink'

import { fork, ChildProcess } from 'child_process'
import { Readable, Transform } from 'stream'

import { join, resolve } from 'path'
import { combineLatest, fromEvent, Observable, ReplaySubject } from 'rxjs'
import { filter, map, merge, startWith, take, shareReplay } from 'rxjs/operators'

import { values, keys, last, propEq } from 'ramda'

import { Application } from './webpack-parallel-ui'
import {
  first,
  Action,
  WebpackConfig,
  WorkerEvents,
  RunnerInput,
  WorkerInput,
  ProgressPayload,
  EndPayload,
  Log,
  WatchPayload,
  resolveConfigFromFileWithNames,
  noErrorsInStats,
} from './worker-actions'

const closeWorkers = (workers: ChildProcess[]) => workers.forEach(w => w.kill())

const pipeToSubject = (stream: Readable, extras: { [key in string]: any }) => {
  const stream$ = new ReplaySubject(1)
  stream.pipe(new Transform({
    transform: (data, _, next) => {
      stream$.next({ data: data.toString(), ...extras })
      next()
    }
  }))
  return stream$
}

const runWorker = ({ config: configPath, workerFile, watch, cwd }: WorkerInput) =>
  (_: WebpackConfig, idx: number): ChildProcess =>
    fork(workerFile, ([
      '--config', configPath,
      '--worker-index', idx.toString(),
      '--process-cwd', cwd,
      watch && '--watch',
    ] as ReadonlyArray<string>).filter(Boolean), {
        cwd,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      })

const getAction = propEq('action')

const getLastFromStream = (action: string) =>
  map((arr: WorkerEvents) => last(arr.filter(getAction(action))))

const connectToWorkers =
  (workersNames: string[]) =>
    (worker: ChildProcess, idx: number): [ChildProcess, Array<Observable<any>>] => {
      const workerDetails = { id: idx, idx, pid: worker.pid, name: workersNames[idx] }
      const workerOut$ = fromEvent(worker, 'message').pipe(
        // because of fromEvent -> sending array [obj, undefined]
        map(d => (Array.isArray(d) ? first(d) : d) as WorkerEvents),
        map((events: WorkerEvents) => events.map(event => ({ ...event, ...workerDetails }))),
      )

      const _logs$ = pipeToSubject(worker.stdout, { type: 'log', ...workerDetails })
      const _errors$ = pipeToSubject(worker.stderr, { type: 'error', ...workerDetails })

      const _start$ = workerOut$.pipe(
        getLastFromStream(Action.start),
        filter(Boolean),
        shareReplay(1),
      )

      const _end$ = workerOut$.pipe(
        getLastFromStream(Action.end),
        filter(Boolean),
        shareReplay(1)
      )

      const _watch$ = workerOut$.pipe(
        getLastFromStream(Action.watch),
        filter(Boolean),
        shareReplay(1)
      )

      const _progress$ = workerOut$.pipe(
        getLastFromStream(Action.progress),
        filter(Boolean),
        shareReplay(1)
      )

      const elapsed = process.hrtime()
      const progressStartWith = startWith({
        action: Action.progress,
        percent: 0,
        message: 'Ready steady go!',
        ...workerDetails
      })

      return [worker, [
        _progress$.pipe(progressStartWith),
        _end$,
        // using startWith for logs as latter on combineLatest is used
        // - worker is not force to log any data, so in such case combineLatest won't run
        _logs$.pipe(
          merge(_errors$),
          startWith({ ...workerDetails, type: 'log', data: 'doing hard work for you... ' }),
          merge(_end$.pipe(map(() =>
            ({ ...workerDetails, type: 'log', data: `finished after: ${process.hrtime(elapsed)}` }))))
        ),
        _watch$,
        _start$,
      ]]
    }

process.on('SIGINT', () => process.exit(0))

export const runWebpackConfigs =
  (Component: typeof Application) =>
    ({ config, workerFile, watch, fullReport, silent, cwd }: RunnerInput): Promise<EndPayload[]> =>
      resolveConfigFromFileWithNames(config)
        .then(resolvedConfigs =>
          (values(resolvedConfigs) as WebpackConfig[])
            .map(runWorker({ config, workerFile, watch, cwd }))
            .map(connectToWorkers(keys(resolvedConfigs) as string[]))
        )
        .then(workersWithStreams => {
          const workers = workersWithStreams.map(([w]) => w)
          const streams = workersWithStreams.map(([_, s]) => s)
          const progressStreams = streams.map(([progress]) => progress)
          const workersProgress$ = combineLatest<ProgressPayload[]>(progressStreams)

          const endsStreams = streams.map(([_, end]) => end)
          const workersEnds$ = combineLatest<EndPayload[]>(endsStreams).pipe(take(1))

          const logsStreams = streams.map(([_, __, logs]) => logs)
          const logs$ = combineLatest<Log[]>(logsStreams)

          const watchStreams = streams.map(([_, __, ___, watcher]) => watcher)
          const workersWatch$ = combineLatest<WatchPayload[]>(watchStreams)

          const unmount = render(<Component
            progress={workersProgress$}
            stats={workersEnds$}
            watch={watch ? workersWatch$ : undefined}
            logs={logs$}
            enableFullReport={fullReport}
            enableRecentActivity={!silent}
          />)

          const killUs = (exitCode: number = 0) => {
            closeWorkers(workers)
            unmount()
            process.exit(exitCode)
          }

          process.on('SIGINT', () => killUs(0))

          return workersEnds$
            .toPromise()
            .then((stats) => {
              setImmediate(() => killUs(noErrorsInStats(stats) ? 0 : 1))
              return stats
            })
        })

// TODO to disable double transpilation for workers
// better would be to create temp config
// another benefit would be to filter out not needed config without
// applying it within worker-builders
export const runWebpackConfigWithDefaultRenderer = runWebpackConfigs(Application)
export const webpackRunCommand = {
  command: 'webpack-parallel',
  describe: 'Run parallel webpack',
  builder: {
    config: { default: '', type: 'string', demand: true },
    cwd: { default: process.cwd() },
    workerFile: { default: join(__dirname, './worker-babel-wrapper.js') },
    fullReport: { default: false },
    silent: { default: false },
    watch: { default: false },
    runWorker: { default: [-1] } // TODO specify worker to run
  },
  handler: (args: RunnerInput) => {
    // yargs demand is not validating correctly
    if (!args.config) return console.error('Please define --config options')

    return runWebpackConfigWithDefaultRenderer({
      ...args,
      config: resolve(args.cwd, args.config)
    })
  }
}
