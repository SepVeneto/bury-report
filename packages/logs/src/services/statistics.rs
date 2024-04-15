use chrono::{Datelike, LocalResult, TimeZone};
use mongodb::{bson::{doc, DateTime}, Database};

use crate::model::{logs, statistics::DataType};

use super::ServiceResult;

// pub fn executeChart(db: &Database, chart_ids: Vec<String>) {
//     logs::Model::find_by_chart(db, pipeline)
// }

// 饼图
pub async fn create (
    db: &Database,
    appid: &str,
    log_type: &str,
    dimension: &str,
) -> ServiceResult<Vec<DataType>> {
    let (start, end) = get_recent_30day()?;
    let pipeline_match= doc! {
        "$match": {
            "appid": appid.to_string(),
            "type": log_type.to_string(),
            "create_time": {
                "$gte": start,
                "$lte": end,
            }
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
            "output": "$_id",
            "sum": "$count"
        }
    };

    let combine_pipeline = vec![
        pipeline_match,
        pipeline_distinct,
        pipeline_count,
        pipeline_output,
    ];
    let res = logs::Model::find_by_chart::<DataType>(db, combine_pipeline).await?;

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
            Err(super::ServiceError::InternalError("获取前一天失败".to_string()))
        }
    } else {
        Err(super::ServiceError::InternalError("获取前一天失败".to_string()))
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
    if let (Some(start_time), Some(end_time)) = (
        now.checked_sub_signed(chrono::Duration::days(1)),
        now.checked_sub_signed(chrono::Duration::days(30)),
    ) {
        Ok((
            DateTime::from_millis(start_time.timestamp_millis()),
            DateTime::from_millis(end_time.timestamp_millis()),
        ))
    } else {
        Err(super::ServiceError::InternalError("获取近30天日期失败".to_string()))
    }

}
