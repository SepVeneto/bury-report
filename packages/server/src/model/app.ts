import { Db } from "mongodb";
import { BaseType, Model } from "./index.ts";

export interface IApp extends BaseType {
  name: string,
  icon?: string
  id?: string
}

export class App extends Model<IApp> {
  constructor(db: Db) {
    super(db, 'apps')
  }
}