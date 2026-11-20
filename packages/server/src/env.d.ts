import { State } from "@oak/oak";
import { Db } from "mongodb";
import { DuckDBConnection } from "@duckdb/node-api";

declare module '@oak/oak' {
  interface Context<
    S extends AS = State,
    // deno-lint-ignore no-explicit-any
    AS extends State = Record<string, any>,
  > {
    resMsg?: string
    resBody?: unknown
    resCode?: number
    db: Db
    duck: DuckDBConnection
    account?: {
      id: string
      name: string
      role: 'admin' | 'member'
    }
  }

  interface Request {
    // deno-lint-ignore no-explicit-any
    query: Record<string, any>
  }
}
