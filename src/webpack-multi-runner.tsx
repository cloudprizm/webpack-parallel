/** @jsx Ink.h */
/** @jsxFrag Ink.h.fragment */

import { fork, ChildProcess } from 'child_process'
import { Readable, Transform } from 'stream'

import * as Ink from 'ink'
import { join, resolve } from 'path'
import { combineLatest, fromEvent, Subject } from 'rxjs'
import { filter, map, merge, startWith, take } from 'rxjs/operators'

import { last, view, lensIndex, propEq } from 'ramda'

import { WorkersStatus } from './webpack-parallel-ui'
import {
  Action,
  WebpackConfig,
  GenericAction,
  RunnerInput,
  resolveConfigFromFile,
  WorkerInput,
  ProgressPayload,
  EndPayload,
  Log,
  WatchPayload,
} from './worker-actions'

const isArray = Array.isArray

type WebpackCommandInput = RunnerInput

const closeWorkers = (workers: ChildProcess[]) => {
  workers.forEach(w => w.kill())
  process.exit()
}

const pipeToSubject = (stream: Readable, extras: { [key in string]: any }) => {
  const stream$ = new Subject()
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
      watch && '--watch'
    ] as ReadonlyArray<string>).filter(Boolean), {
        cwd,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      })

type WorkerEvents = GenericAction[]

const getAction = propEq('action')

const getLastFromStream = (action: string) =>
  map((arr: WorkerEvents) => last(arr.filter(getAction(action))))

const connectToWorkers = (worker: ChildProcess, idx: number) => {
  const workerDetails = { id: idx, idx, pid: worker.pid }
  const workerOut$ = fromEvent(worker, 'message').pipe(
    map(d => (isArray(d) ? first(d) : d) as WorkerEvents), // because of fromEvent -> sending array [obj, undefined]
    map((events: WorkerEvents) => events.map(event => ({ ...event, ...workerDetails }))),
  )

  const _logs$ = pipeToSubject(worker.stdout, { type: 'log', ...workerDetails })
  const _errors$ = pipeToSubject(worker.stderr, { type: 'error', ...workerDetails })

  const _start$ = workerOut$.pipe(getLastFromStream(Action.start), filter(Boolean))
  const _end$ = workerOut$.pipe(getLastFromStream(Action.end), filter(Boolean))
  const _watch$ = workerOut$.pipe(getLastFromStream(Action.watch), filter(Boolean))
  const _progress$ = workerOut$.pipe(getLastFromStream(Action.progress), filter(Boolean))

  const elapsed = process.hrtime()

  return [
    _progress$.pipe(startWith({ action: Action.progress, percent: 0, message: 'Ready steady go!', ...workerDetails })),
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
  ]
}

process.on('SIGINT', () => process.exit())

// tupple destructure
const first = view(lensIndex(0))
const second = view(lensIndex(1))
const third = view(lensIndex(2))
const fourth = view(lensIndex(3))

export const runWebpackConfigs =
  ({ config, workerFile, watch, fullReport, silent, cwd }: WebpackCommandInput) =>
    resolveConfigFromFile(config)
      .then(resolvedConfigs => {
        const workers = resolvedConfigs.map(runWorker({ config, workerFile, watch, cwd }))
        const promisifyWorkers = workers.map(connectToWorkers)
        const workersProgress$ = combineLatest<ProgressPayload[]>(promisifyWorkers.map(first))
        const workersEnds$ = combineLatest<EndPayload[]>(promisifyWorkers.map(second)).pipe(take(1))
        const logs$ = combineLatest<Log[]>(promisifyWorkers.map(third))
        const workersWatch$ = combineLatest<WatchPayload[]>(promisifyWorkers.map(fourth))
        const unmount = Ink.render(<WorkersStatus
          progress={workersProgress$}
          stats={workersEnds$}
          watch={workersWatch$}
          logs={logs$}
          enableFullReport={fullReport}
          enableRecentActivity={!silent}
        />)

        const killUs = () => {
          closeWorkers(workers)
          unmount()
        }

        process.on('SIGINT', () => {
          process.exit()
          killUs()
        })

        return workersEnds$.toPromise()
          .then(killUs)
      })

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
  handler: (args: WebpackCommandInput) => {
    if (!args.config) return console.error('Please define --config options') // yargs demand is not validating correctly
    return runWebpackConfigs({ ...args, config: resolve(args.cwd, args.config) })
  }
}
