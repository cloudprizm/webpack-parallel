/** @jsx Ink.h */
/** @jsxFrag Ink.h.fragment */

import { fork } from 'child_process'
import { Transform } from 'stream'

import Ink from 'ink'
import { join, resolve } from 'path'
import { combineLatest, fromEvent, Subject } from 'rxjs'
import { filter, map, merge, startWith, take, tap, delay } from 'rxjs/operators'

import { view, lensIndex, pipe, propEq, takeLast } from 'ramda'

import { WorkersStatus } from './webpack-parallel-ui'
import { Action } from './worker-actions'

const isArray = Array.isArray

export const resolveConfigFromFile = (configPath) => {
  const config = require(configPath)
  const isPromise = !!config.default.then
  return (isPromise ? config.default : Promise.resolve(config.default))
    .then(c => isArray(c) ? c : [c])
}

const closeWorkers = (workers) => {
  workers.forEach(w => w.kill())
  process.exit()
}

const pipeToSubject = (stream, extras) => {
  const stream$ = new Subject()
  stream.pipe(new Transform({
    transform: (data, _, next) => {
      stream$.next({ data: data.toString(), ...extras })
      next()
    }
  }))
  return stream$
}

const runWorker = ({ configPath, workerFile, watch, cwd }) => (_, idx) =>
  fork(workerFile, [
    '--config', configPath,
    '--worker-index', idx.toString(),
    watch && '--watch'
  ].filter(Boolean), {
      cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    })

const connectToWorkers = (worker, idx) => {
  const workerDetails = { id: idx, idx, pid: worker.pid }
  const workerOut$ = fromEvent(worker, 'message').pipe(
    map(d => isArray(d) ? first(d) : d), // because of fromEvent -> sending array [obj, undefined]
    map(events => events.map(event => ({ ...event, ...workerDetails }))),
  )

  const getAction = propEq('action')
  const _logs$ = pipeToSubject(worker.stdout, { type: 'log', ...workerDetails })
  const _errors$ = pipeToSubject(worker.stderr, { type: 'error', ...workerDetails })

  const getLast = action => map(arr => pipe(takeLast(1), first)(arr.filter(getAction(action))))

  const _start$ = workerOut$.pipe(getLast(Action.start), filter(Boolean))
  const _end$ = workerOut$.pipe(getLast(Action.end), filter(Boolean))
  const _watch$ = workerOut$.pipe(getLast(Action.watch), filter(Boolean))
  const _progress$ = workerOut$.pipe(getLast(Action.progress), filter(Boolean))

  // using startWith for logs as latter on combineLatest is used
  // - worker is not force to log any data, so in such case combineLatest won't run
  // I need array there
  const elapsed = process.hrtime()

  return [
    _progress$.pipe(startWith({ action: Action.progress, percent: 0, message: 'Ready steady go!', ...workerDetails })),
    _end$,
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
  ({ config, workerFile, watch, fullReport, silent, cwd }) =>
    resolveConfigFromFile(config)
      .then(resolvedConfigs => {
        const workers = resolvedConfigs.map(runWorker({ configPath: config, workerFile, watch, cwd }))
        const promisifyWorkers = workers.map(connectToWorkers)
        const workersProgress$ = combineLatest(promisifyWorkers.map(first))
        const workersEnds$ = combineLatest(promisifyWorkers.map(second)).pipe(take(1))
        const logs$ = combineLatest(promisifyWorkers.map(third))
        const workersWatch$ = combineLatest(promisifyWorkers.map(fourth))
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
    workerFile: { default: join(__dirname, './worker-babel-wrapper.ts') },
    fullReport: { default: false },
    silent: { default: false },
    watch: { default: false },
    runWorker: { default: [-1] } // TODO specify worker to run
  },
  handler: (args) => {
    if (!args.config) return console.error('Please define --config options') // yargs demand is not validating correctly
    return runWebpackConfigs({ ...args, config: resolve(args.cwd, args.config) })
  }
}
