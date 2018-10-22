import { runWebpackConfigWithDefaultRenderer } from '../dist'
import { join, resolve } from 'path'
import { enableRuntimeTranspilation } from '@hungry/babel-preset-cli'

const workerFile = join('../dist', './worker-babel-wrapper.js')
const exit = jest.spyOn(process, 'exit').mockImplementation(n => n)

test('full run test', done => {
  const unhook = enableRuntimeTranspilation()
  const config = resolve(__dirname, './fixtures/configs.ts')

  const compile = runWebpackConfigWithDefaultRenderer({
    silent: true,
    watch: false,
    cwd: __dirname,
    config,
    workerFile,
    fullReport: false
  })

  compile.then((stats) => {
    const ignorePid = stats.map((d, idx) => ({ ...d, pid: idx }))

    expect(ignorePid).toMatchSnapshot()
    unhook()

    setImmediate(() => {
      expect(exit).toHaveBeenCalledWith(0)
      done()
    })
  })
})