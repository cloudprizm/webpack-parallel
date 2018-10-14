const yargs = require('yargs')
const { runWebpack } = require('./webpack-parallel-builder')
const { enableRuntimeTranspilation } = require('./transpile-runtime')
const { config, workerIndex, watch, processCwd } = yargs.argv

enableRuntimeTranspilation()
runWebpack({ config, workerIndex, watch: Boolean(watch), processCwd })