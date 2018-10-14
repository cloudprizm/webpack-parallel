const { bootstrap } = require('@hungry/babel-preset-cli')
const debug = require('debug')('webpack-parallel:babel-runtime-transpilation')

type Matcher = (filename: string) => boolean

const defaultMatcher: Matcher = filename => {
  debug(filename)
  return true
}

export const enableRuntimeTranspilation: Matcher = (matcher) => bootstrap({
  matcher: matcher || defaultMatcher
})