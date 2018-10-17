const yargs = require('yargs')
const { runWebpack } = require('./webpack-parallel-builder')
const { enableRuntimeTranspilation } = require('./transpile-runtime')
const { config, workerIndex, watch, processCwd, server } = yargs.argv

enableRuntimeTranspilation()
runWebpack({ config, workerIndex, watch: Boolean(watch), processCwd, server })