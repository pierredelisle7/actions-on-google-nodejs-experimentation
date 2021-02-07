/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { OmniHandler, StandardHandler, BuiltinFrameworks, builtin } from './framework'
import * as common from './common'

/** @public */
export type AppHandler = OmniHandler & BaseApp

/** @public */
export interface AppOptions {
  /** @public */
  debug?: boolean,
  log?: Function
}

/** @hidden */
export interface ServiceBaseApp {
  /** @public */
  handler: StandardHandler
}

/** @public */
export interface Plugin<TService, TPlugin> {
  /** @public */
  <TApp>(app: AppHandler & TService & TApp): (AppHandler & TService & TApp & TPlugin) | void
}

/** @public */
export interface BaseApp extends ServiceBaseApp {
  /** @public */
  frameworks: BuiltinFrameworks

  /** @public */
  use<TService, TPlugin>(
    plugin: Plugin<TService, TPlugin>,
  ): this & TPlugin

  /** @public */
  debug: boolean
  log: Function
}

/** @hidden */
const create = (options?: AppOptions): BaseApp => ({
  frameworks: Object.assign({}, builtin),
  handler: () => Promise.reject(new Error('StandardHandler not set')),
  use(plugin) {
    return plugin(this) || this
  },
  debug: !!(options && options.debug),
  // tslint:disable-next-line:undefined just getting by for now
  log: (typeof (options) === 'undefined' || typeof (options.log) === 'undefined') ? console.log : options.log
})

/** @hidden */
export const attach = <TService>(
  service: TService,
  options?: AppOptions,
): AppHandler & TService => {
  let app: (BaseApp & TService) | (AppHandler & TService) = Object.assign(create(options), service)
  // tslint:disable-next-line:no-any automatically detect any inputs
  const omni: OmniHandler = (...args: any[]) => {
    for (const framework of common.values(app.frameworks)) {
      if (framework.check(...args)) {
        return framework.handle(app.handler)(...args)
      }
    }
    return app.handler(args[0], args[1])
  }
  app = Object.assign(omni, app)

  // Redefine debug, warn, error, info in common.ts according to what I get from app.
  common.setLogs(app.log)

  const handler: typeof app.handler = app.handler.bind(app)
  const standard: StandardHandler = async (body, headers, metadata) => {
    // const log = app.debug ? common.info : common.debug
    const log = app.log
    log('Request', common.stringify(body))
    log('Headers', common.stringify(headers))
    const response = await handler(body, headers, metadata)
    if (!response.headers) {
      response.headers = {}
    }
    response.headers['content-type'] = 'application/json;charset=utf-8'
    log('Response', common.stringify(response))
    return response
  }
  app.handler = standard
  return app as AppHandler & TService
}
