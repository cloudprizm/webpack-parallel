const { bootstrap } = require('@hungry/babel-preset-cli')
bootstrap()

const yargs = require('yargs')
const { runWebpack } = require('./webpack-parallel-builder')

const { config, workerIndex, watch } = yargs.argv
runWebpack({ path: config, workerIndex, watch })