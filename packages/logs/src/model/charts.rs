pub struct _Chart {
    title: String,
    appid: String,
    range: Vec<String>,
    source: String, // data.dm
}

// 饼图
// db.logs.aggregate([ { $match: {"appid": "658bd01a3c4f21c53e488199"}},{$group: {"_id": {uuid: "$data.uuid", "hsdk": "$data.hsdk"}, count: {$sum: 1}}}, {$group: {_id: "$_id.hsdk", count: {$sum: 1}}} ])

//柱状图 折线图
// db.logs.aggregate([ { $match: {"appid": "658bd01a3c4f21c53e488199", create_time: {$gte: ISODate("2024-03-01")}}}, {$project: { create_time: {$dateToString: {format: "%Y-%m-%d", date: "$create_time" }}}},{$sort: {create_time: -1}}, {$group: {"_id": "$create_time", count:{$sum:1}}}, {$sort: {_id: 1}} ])


// appid: 658bd01a3c4f21c53e488199
// source: hsdk
//db.logs.aggregate([ { $match: {"appid": "65d5a172551acda47f467109"}}, {$group: {"_id": { uuid: "$data.uuid", dm: "$data.dm"}, count: {$sum: 1}}} ])
//db.logs.aggregate([ { $match: {"appid": "658bd01a3c4f21c53e488199"}}, {$group: {"_id": { dm: "$data.hsdk"}, count: {$sum: 1}}} ])


//db.logs.aggregate([ { $match: {"appid": "658bd01a3c4f21c53e488199"}}, {$project: { create_time: {$dateToString: {format: "%Y-%m-%d", date: "$create_time" }}}},{$sort: {create_time: -1}}, {$group: {"_id": {"create_time": "$create_time"}, count:{$sum:1}}} ])
