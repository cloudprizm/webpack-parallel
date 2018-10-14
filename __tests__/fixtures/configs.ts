import { withPlugins, reader, withEntry, ChainableConfigDefinition, withMode } from '@hungry/webpack-parts'
import PostCompile from 'post-compile-webpack-plugin'
import { resolve } from 'path'

const entry1 = withEntry.set({ entry1: resolve(__dirname, './entry1.js') })
const entry2 = withEntry.set({ entry2: resolve(__dirname, './entry2.js') })

export const makeDefaults: ChainableConfigDefinition = config =>
  reader
    .of(config)
    .map(withMode.set('development'))

const onEnd = fn => withPlugins.modify(plugins => plugins.concat([new PostCompile(fn)]))

const config1 = makeDefaults({})
  .map(onEnd(() => { console.log('end') }))
  .map(entry1)

const config2 = makeDefaults({})
  .map(onEnd(() => { console.log('end') }))
  .map(entry2)

export const configs = [
  config1.run({ target: 'node' }),
  config2.run({ target: 'web' })
]

export default configs