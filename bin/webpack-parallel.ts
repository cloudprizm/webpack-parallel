#! /usr/bin/env node

const { textSync } = require('figlet')

const clearScreen = () => process.stdout.write('\033c\033[3J')
const getAppName = () => textSync('Webpack parallel', { font: 'Doom' })
const drawBanner = () => {
  const banner = getAppName()
  const by = `by @hungry`

  console.log(banner)
  console.log('\t'.repeat(8), by, '\n')
}

const { bootstrap } = require('@hungry/babel-preset-cli')
bootstrap()

const yargs = require('yargs')
const { webpackRunCommand } = require('../dist/index.js')

webpackRunCommand.command = 'run'

clearScreen()
drawBanner()

yargs
  .command(webpackRunCommand)
  .epilogue('for more information, contact me at damian.baar@gmail.com')
  .demand(1)
  .version()
  .help()
  .strict().argv