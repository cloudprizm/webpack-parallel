#! /usr/bin/env node

const { textSync } = require('figlet')
const { resolve } = require('path')

const clearScreen = () => process.stdout.write('\033c\033[3J')
const getAppName = () => textSync('Webpack parallel', { font: 'Doom' })
const drawBanner = () => {
  const banner = getAppName()
  const by = `by @hungry`

  console.log(banner)
  console.log('\t'.repeat(8), by, '\n')
}

const { webpackRunCommand, enableRuntimeTranspilation } = require('../dist/index.js')
const yargs = require('yargs')

webpackRunCommand.command = 'run'

enableRuntimeTranspilation()
clearScreen()
drawBanner()

yargs
  .command(webpackRunCommand)
  .epilogue('for more information, contact me at damian.baar@gmail.com')
  .demand(1)
  .version()
  .help()
  .strict().argv