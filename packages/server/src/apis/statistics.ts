import { Db } from "mongodb";
import { RulePie, Statistics } from "../model/statistics.ts";
import { Router } from "@oak/oak";

const router = new Router()

router.get('/statistics/list', async (ctx) => {
  const statistics = new Statistics(ctx.db)

  const res = await statistics.getAll()
  ctx.resBody = res
})

router.get('/statistics/preview', async (ctx) => {
  // const statistics = new Statistics(ctx.db)
  const query = ctx.request.query as RulePie
  const res = await queryChart(ctx.db, query)
  ctx.resBody = res
})

export default router

function queryChart(db: Db, rule: RulePie) {
  switch (rule.type) {
    case 'Pie':
      return queryPie(db, rule.source, rule.dimension);
  }
}

router.post('/statistics/create', async (ctx) => {
  const statistics = new Statistics(ctx.db)

  const rule: RulePie = await ctx.request.body.json()
  const cache = await queryChart(ctx.db, rule)

  const res = await statistics.insertOne({
    type: rule.type,
    data: rule,
    // @ts-expect-error: TODO check
    cache,
  })

  ctx.resBody = res
})

router.get('/statistics/chart/:chartId', async (ctx) => {
  const statistics = new Statistics(ctx.db)

  const chartId = ctx.params.chartId
  const res = await statistics.findById(chartId)
  ctx.resBody = res
})

// 饼图
async function queryPie(
  db: Db,
  source: string,
  dimension: string,
) {
  const pipeline_distinct = {
    "$group": {
      "_id": {
        "uuid": "$uuid",
        "dimension": { "$toString": `$data.${dimension}` },
      }
    }
  };
  const pipeline_count = {
    "$group": {
      "_id": "$_id.dimension",
      "count": { "$sum": 1 },
    }
  };
  const pipeline_output = {
    "$project": {
      "name": "$_id",
      "value": "$count"
    }
  };
  const pipeline_sort = {
    "$sort": {
      sort: 1,
    }
  };

  const combinePipeline = [
    // pipeline_match,
    pipeline_distinct,
    pipeline_count,
    pipeline_output,
    pipeline_sort,
  ];
  const statistics = new Statistics(db)
  const res = await statistics.findFromAggregrate(db, source, combinePipeline)

  if (res.length > 100) {
    throw new Error('所选维度统计条目过多，请重新选择')
  }
  return res
}

