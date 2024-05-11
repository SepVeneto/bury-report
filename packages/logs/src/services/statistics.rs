use chrono::{Datelike, LocalResult, TimeZone};
use log::info;
use maplit::hashmap;
use mongodb::{bson::{bson, doc, Bson, DateTime}, Database};

use crate::model::{logs, statistics::{self, DataType, Model, Rule}};

use super::ServiceResult;

// pub fn executeChart(db: &Database, chart_ids: Vec<String>) {
//     logs::Model::find_by_chart(db, pipeline)
// }

pub async fn create_chart(db: &Database, chart_type: &str, appid: &str, data: statistics::Rule) -> ServiceResult<()> {
    let source = data.get_source();
    let dimension = &data.get_dimension();
    let sort = &data.get_sort();
    let cache = query_pie(db, appid, &source, dimension, sort).await?;
    let _ = Model::insert_pie(
        db,
        chart_type,
        appid,
        data,
        cache,
    ).await;
    Ok(())
}

// 饼图
pub async fn query_pie(
    db: &Database,
    appid: &str,
    log_type: &str,
    dimension: &str,
    sort: &str,
) -> ServiceResult<Vec<DataType>> {
    let pipeline_match= doc! {
        "$match": {
            "appid": appid.to_string(),
            "type": log_type.to_string(),
        }
    };
    let pipeline_distinct = doc! {
        "$group": {
            "_id": { "uuid": "$uuid", "dimension": format!("$data.{}", dimension) }
        }
    };
    let pipeline_count = doc! {
        "$group": {
            "_id": "$_id.dimension",
            "count": { "$sum": 1 },
        }
    };
    let pipeline_output = doc! {
        "$project": {
            "name": "$_id",
            "value": "$count"
        }
    };
    let pipeline_sort = doc! {
        "$sort": {
            format!("{sort}", ): 1,
        }
    };

    let combine_pipeline = vec![
        pipeline_match,
        pipeline_distinct,
        pipeline_count,
        pipeline_output,
        pipeline_sort,
    ];
    let res = logs::Model::find_by_chart::<DataType>(db, combine_pipeline).await?;

    Ok(res)

}

pub async fn query_with_date(
    db: &Database,
    appid: &str,
    log_type: &str,
    dimension: &str,
    value: &Vec<String>,
    range: &Vec<String>,
) -> ServiceResult<Vec<DataType>> {
    let (start, end) = get_recent_30day()?;
    let or = value.iter().map(|value| {
        bson! ({ format!("data.{}", dimension): value})
    }).collect::<Vec<Bson>>();
    let pipeline_match = doc! {
        "$match": {
            "appid": appid.to_string(),
            "type": log_type.to_string(),
            "create_time": {
                "$gte": start,
                "$lte": end,
            },
            "$or": or
        }
    };
    let pipeline_distinct = doc! {
        "$group": {
            "_id": {
                "uuid": "$uuid",
                "dimension": format!("$data.{}", dimension),
                "date": "$create_time",
            }
        }
    };
    info!("distinct: {}", &pipeline_distinct.get("$group").unwrap());
    let pipeline_format = doc! {
        "$project": {
            "create_time": {
                "$dateToString": {
                    "format": "%Y-%m-%d",
                    "date": "$_id.date",
                }
            },
            "dimension": "$_id.dimension",
        }
    };
    info!("format: {}", &pipeline_format.get("$project").unwrap());
    let pipeline_count = doc! {
        "$group": {
            "_id": {
                "dimension": "$_id.dimension",
                "date": "$create_time",
            },
            "count": {
                "$sum": 1,
            }
        }
    };
    info!("count: {}", &pipeline_count.get("$group").unwrap());
    let pipeline_output = doc! {
        "$project": {
            "_id": 0,
            "date": "$_id.date",
            "output": "$_id.dimension",
            "sum": "$count",
        },
    };
    info!("output: {}", &pipeline_output.get("$project").unwrap());
    let pipeline_sort = doc! {
        "$sort": {
            "date": 1,
        }
    };

    let combine_pipeline = vec![
        pipeline_match,
        pipeline_distinct,
        pipeline_format,
        pipeline_count,
        pipeline_output,
        pipeline_sort,
    ];
    let res = logs::Model::find_by_chart(db, combine_pipeline).await?;

    Ok(res)
}

/**
 * 累计打开次数(设备)
 */
pub async fn count_total(
    db: &Database,
    appid: &String,
    log_type: &str,
    unique: bool,
) -> ServiceResult<Option<usize>> {
    let mut pipeline = vec![
        doc! {
            "$match": {
                "appid": appid.to_string(),
                "type": log_type.to_string(),
            }
        },
    ];
    if unique {
        pipeline.extend(vec![
            doc! {
                "$group": {
                    "_id": { "uuid": "$uuid", "type": "$type" }
                }
            },
            doc! {
                "$group": {
                    "_id": "$_id.type",
                    "count": { "$sum": 1 },
                }
            }
        ]);
    } else {
        pipeline.extend(vec![
            doc! {
                "$group": {
                    "_id": "$type",
                    "count": { "$sum": 1 },
                }
            }
        ]);
    }
    pipeline.push(doc! {
        "$project": {
            "log_type": "$_id",
            "count": 1,
        }
    });

    let res = logs::Model::find_by_chart::<DataType>(db, pipeline).await?;
    if let Some(_res) = res.get(0) {
        if let DataType::Total(res) = _res {
            Ok(Some(res.count))
        } else {
            Ok(None)
        }
        // if let DataType::Total(res) = _res {
        //     Ok(Some(res.count))
        // } else {
        //     Ok(None)
        // }
    } else {
        Ok(None)
    }
}

/**
 * 昨日累计打开次数(设备)
 */
pub async fn count_yesterday(
    db: &Database,
    appid: &String,
    log_type: &str,
    unique: bool,
) -> ServiceResult<usize> {
    let (start, end) = get_sub_date()?;
    let mut pipeline = vec![
        doc! {
            "$match": {
                "appid": appid.to_string(),
                "type": log_type.to_string(),
                "create_time": {
                    "$gte": start,
                    "$lte": end,
                }
            },
        },
    ];

    if unique {
        pipeline.extend(vec![
            doc! {
                "$group": {
                    "_id": { "uuid": "$uuid", "type": "$type" }
                }
            },
            doc! {
                "$group": {
                    "_id": "$_id.type",
                    "count": { "$sum": 1 },
                }
            }
        ]);
    } else {
        pipeline.extend(vec![
            doc! {
                "$group": {
                    "_id": "$type",
                    "count": { "$sum": 1 },
                }
            },
        ]);
    }
    pipeline.push(doc! {
        "$project": {
            "log_type": "$_id",
            "count": 1,
        }
    });
    let res = logs::Model::find_by_chart::<DataType>(db, pipeline).await?;
    if let Some(_res) = res.get(0) {
        if let DataType::Total(res) = _res {
            Ok(res.count)
        } else {
            Ok(0)
        }
    } else {
        Ok(0)
    }
}

fn get_sub_date() -> ServiceResult<(DateTime, DateTime)>{
    let now = chrono::Utc::now();
    if let Some(time) = now.checked_sub_signed(chrono::Duration::days(1)) {
        let year = time.year();
        let month = time.month();
        let day = time.day();

        let time_start = chrono::Utc.with_ymd_and_hms(year, month, day, 0, 0, 0);
        let time_end = chrono::Utc.with_ymd_and_hms(year, month, day, 23, 59, 59);

        if let (LocalResult::Single(yesterday_start), LocalResult::Single(yesterday_end)) = (time_start, time_end) {
            let start = DateTime::from_millis(yesterday_start.timestamp_millis());
            let end = DateTime::from_millis(yesterday_end.timestamp_millis());
            Ok((start, end))
        } else {
            Err("获取前一天失败".into())
        }
    } else {
        Err("获取前一天失败".into())
    }
}

pub async fn total_trend(
    db: &Database,
    appid: &String,
    log_type: &str,
    unique: bool,
) -> ServiceResult<Option<()>>{
    let pipeline = doc! {
        "$match": {
            "appid": appid.to_owned(),
            "type": log_type.to_owned(),
        }
    };

    Ok(Some(()))
}

fn get_recent_30day() -> ServiceResult<(DateTime, DateTime)>{
    let now = chrono::Utc::now();
    if let (Some(end_time), Some(start_time)) = (
        now.checked_sub_signed(chrono::Duration::days(1)),
        now.checked_sub_signed(chrono::Duration::days(30)),
    ) {
        Ok((
            DateTime::from_millis(start_time.timestamp_millis()),
            DateTime::from_millis(end_time.timestamp_millis()),
        ))
    } else {
        Err("获取近30天日期失败".into())
    }

}

pub async fn find_all(db: &Database, appid: &str) -> ServiceResult<Vec<Model>> {
    let res = Model::find_many(db, appid).await?;
    Ok(res)
}

pub async fn find_cache(db: &Database, id: &str) -> ServiceResult<Vec<DataType>> {
    let res = Model::find_by_id(db, id).await?;
    if let Some(model) = res {
        Ok(model.cache)
    } else {
        Ok(vec![])
    }
}

pub async fn update(db: &Database, statistic_id: &str, data: Rule) -> ServiceResult<()> {
    let config = Model::find_by_id(db, statistic_id).await?;
    if let Some(config) = config {
        let rule = config.data;
        let appid = config.appid;
        let source = rule.get_source();
        let dimension = rule.get_dimension();
        let sort = rule.get_sort();

        let cache = query_pie(db, &appid, &source, &dimension, &sort).await?;
        let res = Model::update_one(db, statistic_id, data, cache).await?;
        Ok(res)
    } else {
        Err("修改的图表不存在".into())
    }
}

pub async fn delete(db: &Database, statistic_id: &str) -> ServiceResult<()> {
    Model::delete_one(db, statistic_id).await?;
    Ok(())
}
