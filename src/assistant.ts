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
export interface LogFn {
  (params: any[]): void;
}

/** @public */
export interface AppLogs {
  debug: LogFn,
  info: LogFn,
  warn: LogFn,
  error: LogFn
}

/** @public */
export interface AppOptions {
  /** @public */
  debug?: boolean,
  logs?: AppLogs
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
  logs?: AppLogs
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
  logs: (typeof (options) === 'undefined' || typeof (options.logs) === 'undefined') ? undefined : options.logs
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

  if (app.logs) {
    // Redefine debug, warn, error, info according to app definitions of logs.
    common.setLogs(app.logs)
  }

  const handler: typeof app.handler = app.handler.bind(app)
  const standard: StandardHandler = async (body, headers, metadata) => {
    const log = app.debug ? common.info : common.debug
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
