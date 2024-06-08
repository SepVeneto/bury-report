/* global use, db */
// MongoDB Playground
// Use Ctrl+Space inside a snippet or a string literal to trigger completions.

const database = 'reporter';

// Create a new database.
use(database);

// Create a new collection.
let appList = db.apps.find()
appList.forEach(app => {
    const appid = app._id.toString()
    const filterLog = {
        appid,
        type: '__BR_COLLECT_INFO__',
    }
    const filterErr = {
        appid,
        type: '__BR_COLLECT_ERROR__',
    }
    const filterApi = {
        appid,
        type: '__BR_API__',
    }

    db.logs.aggregate([
        {
            '$match': filterLog,
        },
        {
            '$out': {
                db: `app_${appid}`,
                coll: 'records_log',
            }
        }
    ])
    db.logs.deleteMany(filterLog)

    db.logs.aggregate([
        {
            '$match': filterErr,
        },
        {
            '$out': {
                db: `app_${appid}`,
                coll: 'records_err',
            }
        }
    ])
    db.logs.deleteMany(filterErr)

    db.logs.aggregate([
        {
            '$match': filterApi
        },
        {
            '$out': {
                db: `app_${appid}`,
                coll: 'records_api',
            }
        }
    ])
    db.logs.deleteMany(filterApi)

    const rest = db.logs.find({ appid }).toArray()
    use(`app_${appid}`);
    db.records_log.insertMany(rest)

    use(database)
    db.logs.deleteMany({ appid, })
})

// The prototype form to create a collection:
/* db.createCollection( <name>,
  {
    capped: <boolean>,
    autoIndexId: <boolean>,
    size: <number>,
    max: <number>,
    storageEngine: <document>,
    validator: <document>,
    validationLevel: <string>,
    validationAction: <string>,
    indexOptionDefaults: <document>,
    viewOn: <string>,
    pipeline: <pipeline>,
    collation: <document>,
    writeConcern: <document>,
    timeseries: { // Added in MongoDB 5.0
      timeField: <string>, // required for time series collections
      metaField: <string>,
      granularity: <string>,
      bucketMaxSpanSeconds: <number>, // Added in MongoDB 6.3
      bucketRoundingSeconds: <number>, // Added in MongoDB 6.3
    },
    expireAfterSeconds: <number>,
    clusteredIndex: <document>, // Added in MongoDB 5.3
  }
)*/

// More information on the `createCollection` command can be found at:
// https://www.mongodb.com/docs/manual/reference/method/db.createCollection/
