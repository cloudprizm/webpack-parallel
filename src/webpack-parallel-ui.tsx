/** @jsx h */
/** @jsxFrag h.fragment */

import chalk from 'chalk'
import { h, Color, Component, Text } from 'ink'
import Divider from 'ink-divider'
import ProgressBar from 'ink-progress-bar'
import Spinner from 'ink-spinner'

import { cond, ifElse, isEmpty, pipe, prop, sortBy, uniq } from 'ramda'
import { combineLatest, empty, Observable, Subscription } from 'rxjs'
import { startWith } from 'rxjs/operators'
import wrap from 'word-wrap'

import { Log, MinimalStats, ProgressPayload, WatchPayload } from './worker-actions'

// const { h } = require('ink') // need to track down why it is not able to take this from import

const maxWidth = process.stdout.columns || 100
const defaultWidth = Math.min(100, maxWidth)

const sortFullLogs = pipe(
  // @ts-ignore
  uniq,
  sortBy(prop('idx')),
)

const withDefault = (defaultVal?: boolean) => ifElse(isEmpty, () => defaultVal, e => Boolean(e))
const withDefaultTrue = withDefault(true)

type ProgressStream = Observable<ProgressPayload[]>
type WatchStream = Observable<WatchPayload[]>
type LogsStream = Observable<Log[]>
type StatsStream = Observable<MinimalStats[]>

interface InputStreams {
  progress$: ProgressStream
  watch$: WatchStream
  logs$: LogsStream
  stats$: StatsStream
}

interface Props {
  enableFullReport: boolean
  enableRecentActivity: boolean
  progress?: ProgressStream
  watch?: WatchStream
  logs?: LogsStream
  stats?: StatsStream
}

interface State {
  enableFullReport: boolean
  enableRecentActivity: boolean
  watch: boolean
  watcherStats: MinimalStats[]
  progress: ProgressPayload[]
  stats?: MinimalStats[]
  allLogs: Log[]
  logs: Log[]
}

interface WithStats {
  stats?: MinimalStats[]
}

interface WithLogs {
  logs: Log[]
}

interface WithCompilationResult {
  stats: string[]
}

interface WithProgress {
  progress: ProgressPayload[]
}

interface WithTitle {
  title?: string
}

const RenderStatus = ({ stats, prefix, color }: WithCompilationResult & { prefix: string, color: string }) =>
  <div>
    {stats.length > 0
      ? <Text>{wrap(stats.map((m, i) =>
        chalk`{${color} {bold.rgb(0,0,0) ${i.toString()}. ${prefix}}}\n${m}`)
        .reduce((acc, message) => `${acc}\n${message}`, ''))
      }</Text>
      : <Text green>{wrap(`No ${prefix}s`)}</Text>
    }
  </div>

const getColor = cond([
  [d => d.errors.length > 0, () => 'red'],
  [d => d.warnings.length > 0, () => 'yellow'],
  [d => d.warnings.length === 0 && d.errors.length === 0, () => 'green'],
])

const WaitingForWorkers = () =>
  <div>
    <Spinner green />
    <Color> waiting for workers</Color>
  </div>

const Stats = ({ stats, title }: WithStats & WithTitle) =>
  <div>{stats && stats.map(workerStats =>
    <div>
      <Divider
        titleColor={getColor(workerStats)}
        title={`${title || 'Worker stats'}, id: ${workerStats.id}, pid: ${workerStats.pid}`}
        width={defaultWidth}
        padding={0}
      />
      <RenderStatus
        stats={workerStats.errors}
        prefix="error"
        color="bgRed"
      />
      <RenderStatus
        stats={workerStats.warnings}
        prefix="warning"
        color="bgYellow"
      />
    </div>
  )}</div>

const RenderProgress = ({ progress }: WithProgress) => {
  const prepareStatus = (d: ProgressPayload) => [
    chalk`{bgGreenBright {black [step]}} ${d.message}`,
    d.step && chalk`{gray [status] ${d.step}}`,
  ].filter(Boolean).join(' ')

  return <div>
    {progress.map(d => {
      return <div>
        <Divider titleColor="green" title={`Worker, id: ${d.id}, pid: ${d.pid}`} width={defaultWidth} padding={0} />
        <div>
          <ProgressBar character="|" percent={d.percent} left={0} right={maxWidth - defaultWidth} />
          <Text>{Math.round(d.percent * 100)}</Text>
        </div>
        {d.percent < 1 ? <Text>{prepareStatus(d)}</Text> : <Text>{chalk`{bgGreen {black DONE}}`}</Text>}
      </div>
    })}</div>
}

const renderWhen = cond([
  [state => state.progress.length === 0, () => <WaitingForWorkers />],
  [state => state.stats && state.stats.length > 0, (state: State) => <Stats stats={state.stats} />],
  [state => state.progress.length > 0, (state: State) => <RenderProgress progress={state.progress} />]
])

const LogEntry = ({ log }: { log: Log }) => <div>
  <Text
    white={log.type === 'log'}
    red={log.type === 'error'}
  >{`[${log.idx}]: ${log.data}`}</Text>
</div>

const RecentWorkerActivity = ({ title, logs }: WithLogs & WithTitle) => <div>
  <Divider title={'Recent activity from workers' || title} width={defaultWidth} padding={0} />
  {logs.map(log => <LogEntry log={log} />)}
</div>

const FullReportFromRun = ({ logs }: WithLogs) => <div>
  <Divider title="Full activity from workers" width={defaultWidth} padding={0} />
  <div>{sortFullLogs(logs).map((log: Log) => <LogEntry log={log} />)}</div>
</div>

const renderRecentActivity = cond([
  [(state) => state.logs.length > 0 && state.enableRecentActivity,
  (state: State) => <RecentWorkerActivity logs={state.logs} />],
])

const renderFullReportAfterRun = cond([
  [(state) => state.enableFullReport && state.stats && state.allLogs.length > 0,
  (state: State) => <FullReportFromRun logs={state.allLogs} />
  ],
])

const renderWatcherStats = cond([
  [
    (state) => state.watcherStats.length > 0,
    (state: State) => <Stats
      stats={state.watcherStats}
    />
  ]
])

const makeSafeStream = (stream?: Observable<any>) => stream || empty()
// TODO 
// 1) add full log report when running with watcher - scrollable list
export class WorkersStatus extends Component<Props, State> implements InputStreams {
  public progress$: Observable<ProgressPayload[]>
  public watch$: Observable<WatchPayload[]>
  public stats$: Observable<MinimalStats[]>
  public logs$: Observable<Log[]>
  public state: State

  private subscription?: Subscription

  constructor(props: Props) {
    super(props)

    const defaults: State = {
      enableFullReport: withDefaultTrue(props.enableFullReport),
      enableRecentActivity: withDefaultTrue(props.enableRecentActivity),
      watcherStats: [],
      progress: [],
      watch: !!props.watch,
      stats: undefined,
      allLogs: [] as Log[],
      logs: [] as Log[]
    }

    this.progress$ = makeSafeStream(props.progress).pipe(startWith(defaults.progress))
    this.stats$ = makeSafeStream(props.stats).pipe(startWith(defaults.stats))
    this.logs$ = makeSafeStream(props.logs).pipe(startWith(defaults.logs))
    this.watch$ = makeSafeStream(props.watch).pipe(startWith(defaults.watcherStats))

    this.state = { ...defaults }
  }

  public render(props: Props, state: State) {
    return <div>
      {renderWhen(state)}
      {renderRecentActivity(state)}
      {renderWatcherStats(state)}
      {renderFullReportAfterRun(state)}
    </div>
  }

  public componentDidMount() {
    const inputs = combineLatest(
      this.progress$,
      this.stats$,
      this.logs$,
      this.watch$,
    )

    const connect = inputs.subscribe(([progress, stats, logs, watcherStats]) => {
      // @ts-ignore - workaround -> not sure why tsc is not happy about this - setState is missing
      const setState = this.setState
      setState({
        progress,
        stats,
        logs,
        watcherStats,
        allLogs: this.state.allLogs.concat(logs),
      })
    })

    this.subscription = connect
  }

  public componentWillUnmount() {
    if (this.subscription) this.subscription.unsubscribe()
  }
}
