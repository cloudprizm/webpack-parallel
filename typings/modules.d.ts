declare module 'ink-divider'
declare module 'ink-progress-bar'
declare module 'ink-spinner'
declare module 'ink' {
  import { ComponentLifecycle, ValidationMap, StaticLifecycle, ComponentState } from 'react'

  type Children = Component<any, any> | Text | string | number

  class Component<P, S> {
    constructor(props: Readonly<P>)
    setState<K extends keyof S>(
      state: ((prevState: Readonly<S>, props: Readonly<P>) => (Pick<S, K> | S | null)) | (Pick<S, K> | S | null),
      callback?: () => void
    ): void

    forceUpdate(callBack?: () => void): void
    readonly props: Readonly<{ children?: Children }> & Readonly<P>;
    render(props?: P, state?: S): any
    state: Readonly<S>
    context: any
    refs: {
      [key: string]: any
    }
  }

  class Color extends Component<any, any> { }
  class Text extends Component<any, any> { }
  export const h: any // can be more precise, based upon createElement
}