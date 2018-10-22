import React, { Component } from 'react'
import { Box, Text, Color } from 'ink'
import { Divider, ProgressBar } from '@hungry/ink-components'

import { Route } from 'react-router-dom'
import { StaticRouter } from 'react-router'

import chalk from 'chalk'

import { equals, cond, ifElse, isEmpty, pipe, prop, sortBy, uniq, Pred, Arity1Fn } from 'ramda'
import { combineLatest, Observable, Subscription } from 'rxjs'
import { startWith } from 'rxjs/operators'
import wrap from 'word-wrap'

import {
  Log,
  AnnotatedByMaster,
  MinimalStats,
  ProgressPayload,
  WatchPayload,
  makeSafeStream,
} from './worker-actions'

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

export interface InputStreams {
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

export enum View {
  index = 'index',
  activityView = 'activityView'
}

interface State {
  enableFullReport: boolean
  enableRecentActivity: boolean
  watch: boolean
  watcherStats: WatchPayload[]
  progress: ProgressPayload[]
  stats: MinimalStats[]
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
    {/* <Spinner green /> */}
    <Color> waiting for workers</Color>
  </div>

const getTitle = ({ title, stats }: { stats: AnnotatedByMaster } & WithTitle) =>
  `${title || 'Worker stats'}: ${stats.name ? `${stats.name.toUpperCase()},` : ''} id: ${stats.id}, pid: ${stats.pid}`

const Stats = ({ stats, title }: WithStats & WithTitle) =>
  <div>{stats && stats.map(workerStats =>
    <div>
      <Divider
        color={getColor(workerStats)}
        title={getTitle({ title, stats: workerStats })}
        width={defaultWidth}
        alignItems="flex-end"
        justifyContent="space-around"
        flexGrow={1}
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

const RenderProgressEntry = ({ progress: p }: { progress: ProgressPayload }) =>
  p.percent < 1
    ? <Box>
      <Box paddingRight={1}>
        <Color black bgGreenBright>[status]</Color>
        <Color> {p.message}</Color>
      </Box>
      {p.step && <Color gray>{`[step]: ${p.step || p.active || p.moduleName}`}</Color>}
    </Box>
    : <Color black bgGreenBright>DONE</Color>

const RenderProgress = ({ progress }: WithProgress) =>
  <div>
    {progress.map((d, key) =>
      <div key={key}>
        <Divider
          color="green"
          title={getTitle({ stats: d })}
          padding={1}
          width={defaultWidth}
          alignItems="center"
          justifyContent="space-around"
          flexGrow={1}
        />

        <Box>
          <ProgressBar
            percent={d.percent}
            width={defaultWidth}
          />
          <Text>{Math.round(d.percent * 100).toString()}</Text>
        </Box>
        <RenderProgressEntry progress={d} />
      </div>
    )}</div>

const renderWhen = cond([
  [state => state.progress.length === 0, () => <WaitingForWorkers />],
  [state => state.stats.length > 0, (state: State) => <Stats stats={state.stats} />],
  [state => state.progress.length > 0, (state: State) => <RenderProgress progress={state.progress} />]
])

const LogEntry = ({ log }: { log: Log }) => <div>
  <Text
    white={log.type === 'log'}
    red={log.type === 'error'}
  >{`[${log.name}]: ${log.data}`}</Text>
</div>

const RecentWorkerActivity = ({ title, logs }: WithLogs & WithTitle) => <div>
  <Divider
    title={'Recent activity from workers' || title}
    width={defaultWidth}
    alignItems="center"
    justifyContent="space-around"
    flexGrow={1}
    padding={1}
  />
  {logs.map((log, key) => <LogEntry log={log} key={key} />)}
</div>

const FullReportFromRun = ({ logs }: WithLogs) => <div>
  <Divider
    title="Full activity from workers"
    width={defaultWidth}
    color="green"
    alignItems="center"
    justifyContent="space-around"
    flexGrow={1}
    padding={1}
  />
  <div>{sortFullLogs(logs).map((log: Log) => <LogEntry log={log} />)}</div>
</div>

const renderRecentActivity = cond([
  [(state) => state.logs.length > 0 && state.enableRecentActivity,
  (state: State) => <RecentWorkerActivity logs={state.logs} />],
])

const renderFullReportAfterRun = cond([
  [(state) => state.enableFullReport && state.stats && state.allLogs.length > 0,
  (state: State) => <FullReportFromRun logs={state.allLogs} />],
])

const renderWatcherStats = cond([
  [(state) => state.watcherStats.length > 0,
  (state: State) => <Stats stats={state.watcherStats} />],
])

const shortcuts = [
  ['I', View.index, 'Realtime workers progress'],
  ['A', View.activityView, 'Realtime logs Activity']
]

const shortcutsMatcher = cond(
  shortcuts.map(([shortcut, view]) =>
    [equals<string>(shortcut), () => view] as [Pred, Arity1Fn]
  )
)

const ShortcutsView = () =>
  <div>
    <Divider
      title="Shortcuts"
      color="green"
      width={defaultWidth}
      padding={1}
      renderDivider={({ title }) =>
        <Color bgGreenBright black>{`--${title}--`}</Color>
      }
    />
    {shortcuts.map(([shortcut, view, friendlyName], idx) =>
      <Box key={idx}>
        <Color grey>Press "{shortcut}" to display</Color>
        <Color> {friendlyName}</Color>
      </Box>
    )}
  </div>

export const clearScreen = () => process.stdout.write('\x1Bc')

// tslint:disable-next-line:max-classes-per-file
export class MultiRunnerCLIView extends Component<Props, State> implements InputStreams {
  public progress$: Observable<ProgressPayload[]>
  public watch$: Observable<WatchPayload[]>
  public logs$: Observable<Log[]>
  public stats$: Observable<MinimalStats[]>
  public state: State

  constructor(props: Props) {
    super(props)

    const defaults: State = {
      enableFullReport: withDefaultTrue(props.enableFullReport),
      enableRecentActivity: withDefaultTrue(props.enableRecentActivity),
      watcherStats: [],
      progress: [],
      watch: !!props.watch,
      stats: [],
      allLogs: [] as Log[],
      logs: [] as Log[],
    }

    this.progress$ = makeSafeStream(props.progress).pipe(startWith(defaults.progress))
    this.logs$ = makeSafeStream(props.logs).pipe(startWith(defaults.logs))
    this.stats$ = makeSafeStream(props.stats).pipe(startWith(defaults.stats))
    this.watch$ = makeSafeStream(props.watch).pipe(startWith(defaults.watcherStats))

    this.state = { ...defaults }
  }
}

// tslint:disable-next-line:max-classes-per-file
export class FullLogsView extends MultiRunnerCLIView {
  private subscription?: Subscription

  public render() {
    return <FullReportFromRun logs={this.state.allLogs} />
  }

  public componentDidMount() {
    const inputs = combineLatest(
      this.logs$,
    )

    const connect = inputs.subscribe(([logs]) => {
      // @ts-ignore - workaround -> not sure why tsc is not happy about this - setState is missing
      const setState = this.setState.bind(this)
      setState({
        logs,
        allLogs: this.state.allLogs.concat(logs),
      })
    })

    this.subscription = connect
  }

  public componentWillUnmount() {
    if (this.subscription) this.subscription.unsubscribe()
  }
}

// tslint:disable-next-line:max-classes-per-file
export class RealTimeWorkerStatus extends MultiRunnerCLIView {
  private subscription?: Subscription

  public render() {
    return <div>
      {renderWhen(this.state)}
      {renderRecentActivity(this.state)}
      {renderWatcherStats(this.state)}
      {!this.props.watch && renderFullReportAfterRun(this.state)}
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
      const setState = this.setState.bind(this)
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

interface ApplicationState {
  currentView: View
}
// tslint:disable-next-line:max-classes-per-file
export class Application extends Component<Props, ApplicationState> {
  public keyHandler
  public routerContext = {}

  constructor(props: Props) {
    super(props)
    this.keyHandler = this.onKeyPress.bind(this)
    this.state = {
      currentView: View.index
    }
  }

  public onKeyPress(key: string) {
    if (key === '\x03') process.exit(0)
    this.setState({ currentView: shortcutsMatcher(key) })
  }

  public shouldComponentUpdate(nextProps: Props, nextState: ApplicationState) {
    if (nextState.currentView !== this.state.currentView) {
      clearScreen()
      return true
    }
    return this.props !== nextProps
  }

  public componentDidMount() {
    const stdin = process.stdin
    // @ts-ignore
    stdin.setRawMode(true)
    stdin.setEncoding('utf8')
    stdin.on('data', this.keyHandler)
  }

  public componentWillUnmount() {
    process.stdin.removeListener('data', this.keyHandler)
  }

  public render() {
    return <div>
      <ShortcutsView />
      <StaticRouter
        location={this.state.currentView}
        context={this.routerContext}
      ><>
          <Route
            path={View.index}
            component={() => <RealTimeWorkerStatus {...this.props} />}
          />
          <Route
            path={View.activityView}
            component={() => <FullLogsView {...this.props} />}
          />
        </>
      </StaticRouter>
    </div>
  }
}
