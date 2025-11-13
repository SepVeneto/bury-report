// global.d.ts 或 types/oak.d.ts
import { State } from "@oak/oak";
import { RouteParams } from "@oak/oak";

declare module '@oak/oak' {
  interface RouterContext<
    R extends string,
    P extends RouteParams<R> = RouteParams<R>,
    // deno-lint-ignore no-explicit-any
    S extends State= Record<string, any>,
  > {
    resMsg?: string
    resBody?: unknown
    resCode?: number
  }

  interface Request {
    // deno-lint-ignore no-explicit-any
    query: Record<string, any>
  }
}