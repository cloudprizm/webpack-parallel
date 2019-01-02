# Webpack parallel runner
Command line tool for running webpack multiple configurations written in typescript with watch ability.

## Look and feel
![clean-run](https://user-images.githubusercontent.com/1121938/46614709-cdf67400-cb16-11e8-8d32-e9b164a9dd73.gif)

## Install
```sh
# global yarn
yarn global @hungry/webpack-parallel

# global npm
npm install -g @hungry/webpack-parallel

# or as dependency
yarn add @hungry/webpack-parallel
```

## Usage
```sh
webpack-parallel run --config your_config --fullReport
```

### Config file
`webpack-parallel` expects `array`, single `config` or a `Promise` of config/s.

```js
const myConfigs = [...] // array of webpack configs

// optional - if you'd see named configs instead of seeing indexes
export const configNames = ['friendly-config-name-1', 'friendly-config-name-2'] 

export default new Promise(...)
  .then(...) // do some clean up, any shared operations before build or watch
  .then(()) => myConfigs)
```

## Supported commands
```sh 
Run parallel webpack

Options:
  --version     Show version number                                    [boolean]
  --help        Show help                                              [boolean]
  --config                                     [string] [required] [default: ""]
  --cwd                                                            [default: ""]
  --workerFile                                                     [default: ""]
  --fullReport                                                  [default: false]
  --silent                                                      [default: false]
  --watch                                                       [default: false]
```

## How to use it
It is used in conjunction with [`@hungry/webpack-parts`](https://github.com/hungry-consulting/webpack-parts) - composable, typesafe webpack config, however it is not necessary.

## Selling points
* compatible with `webpack` watch
* compatible with `webpack-dev-server` and `hmr`
* reliable error handling
* exposed separate command for `yargs` if you've got already your custom command line tree
* full report activity - sorted by worker id report from `stdin` and `stderr`
* can connect any worker - there is an utility class provided for communication and wrapper to run any config based on `babel`
* full control over pipes and rendering phase - if you want to help me extend it

## Motivation
There is couple of implementation of parallel building for webpack, however I wanted to provide something dev oriented with clear error reporting when there is spawned many of concurrent builds.
