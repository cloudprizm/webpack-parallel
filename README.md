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
  --runWorker                                                    [default: [-1]]
```

## How to use it
It is used in conjunction with [`@hungry/webpack-parts`](https://github.com/hungry-consulting/webpack-parts) - composable, typesafe webpack config, however it is not necessary.

## Selling points
* reliable error handling
* compatible with `webpack` watch
* exposed separate command for `yargs` if you've got already your custom command line tree
* full report activity - sorted by worker id report from `stdin` and `stderr`
* can connect any worker - there is an utility class provided for communication and wrapper to run any config based on `babel`
* full control over pipes and rendering phase - if you want to help me extend it

## Motivation
There is couple of implementation of parallel building for webpack, however I wanted to provide something dev oriented with correct error reporting without hacks.

## Caveats / TODO
- [ ] think about compatibility with `webpack-dev-server` - for now, you can go with `nodemon` and observe your out directory to restart server or with webpack plugin `post-compile-webpack-plugin` and do some magic there
- [ ] provide scrollable report from workers - if there is a lot of things to log, sometimes UI becomes glitchy