import dotenv from 'dotenv'
import { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTaskStore, InMemoryTaskMessageQueue } from '@modelcontextprotocol/sdk/experimental';
import { randomUUID } from 'node:crypto';
import * as z from 'zod/v4';
import {
  CallToolResult,
  ElicitResultSchema,
  GetPromptResult,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { client } from './db'
import dayjs from 'dayjs'

dotenv.config()

const DOMAIN = process.env.DOMAIN
if (!DOMAIN) {
  throw new Error('missing allowed host')
}
const app = createMcpExpressApp({ allowedHosts: [DOMAIN]});

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
// Create shared task store for demonstration
const taskStore = new InMemoryTaskStore();

// Create an MCP server with implementation details
const getServer = () => {
    const server = new McpServer(
        {
            name: 'simple-streamable-http-server',
            version: '1.0.0',
            icons: [{ src: './mcp.svg', sizes: ['512x512'], mimeType: 'image/svg+xml' }],
            websiteUrl: 'https://github.com/modelcontextprotocol/typescript-sdk'
        },
        {
            capabilities: { logging: {}, tasks: { requests: { tools: { call: {} } } } },
            taskStore, // Enable task support
            taskMessageQueue: new InMemoryTaskMessageQueue()
        }
    );

    server.registerTool(
      'query-datetime',
      {
        title: '查询时间',
        description: '查询当前时间',
        inputSchema: {},
        outputSchema: {
          code: z.number(),
          data: z.string(),
          msg: z.string(),
        }
      },
      async (_, context) => {
        const userid = context.requestInfo?.headers['x-wecom-user-id']

        const datetime = dayjs().format('YYYY-MM-DD HH:mm:ss')

        return {
          content: [{ type: 'text', text: datetime }],
          structuredContent: {
            code: 0,
            data: datetime,
            msg: '查询成功',
          }
        }
      }
    )

    server.registerTool(
      'deploy-task',
      {
        title: '执行部署任务',
        description: '根据用户的输入对部署任务做相关操作，包括创建取消和查询',
        inputSchema: {
          action: z.enum(['create', 'cancel', 'query']).describe('具体的操作，支持创建取消和查询'),
          name: z.string().describe('任务名称（支持模糊查询），可能是简称，或者是代指某一平台'),
          immediate: z.boolean().describe('该任务是否立即执行, 如果没有明确指定执行时间，可以认为是立即执行'),
          date: z.string().optional().describe('非立即执行的任务会有一个定时时间, 需要将这个时间转换为YYYY-MM-DD HH:mm:ss格式'),
          appid: z.string(),
        },
        outputSchema: {
          code: z.number(),
          data: z.any().nullable(),
          msg: z.string(),
        }
      },
      async ({ action, name, immediate, date, appid }, context) => {
        const userid = context.requestInfo?.headers['x-wecom-user-id']
        try {
          const res = await request(appid, `/task/list`, {
            method: 'get',
            params: {
              page: 1,
              size: 99,
              name,
            }
          })
          const list = res.list as any[]

          if (!res.list.length) {
            return {
              content: [],
              structuredContent: {
                code: 1,
                data: null,
                msg: '没有找到相关任务',
              }
            }
          } else if (list.length === 1) {
            let data = null
            const task = list[0]
            console.log(task._id, task.name, immediate, date)
            switch (action) {
              case 'create': {
                await request(appid, `/task/${task.id}`, {
                  method: 'PUT',
                  body: {
                    immediate,
                    execute_time: dayjs(date).format('YYYY-MM-DD HH:mm:ss'),
                    operator: userid,
                  }
                })
                data = { name: list[0].name, date }
                break
              }
              case 'cancel': {
                await request(appid, `/task/${task.id}/stop`, {
                  method: 'POST',
                  body: {
                    operator: userid,
                  }
                })
                break
              }
              case 'query': {
                data = task
                break
              }
            }
            return {
              content: [],
              structuredContent: {
                code: 0,
                data,
                msg: '执行成功',
              }
            }

          } else {
            return {
              content: [],
              structuredContent: {
                  code: 2,
                  data: list.map(item => item.name),
                  msg: '查询到多个符合条件的任务',
                }
            }
          }
        } catch (err) {
          return {
            content: [],
            structuredContent: {
                code: 1,
                data: null,
                msg: `遇到了错误：${err}`,
              }
          }
        }
      }
    )

    server.registerTool(
      'query-fp-info',
      {
        title: '指纹信息查询',
        description: '根据指纹查询告警相关的信息',
        inputSchema: {
          appid: z.string().describe('应用ID'),
          fp: z.string().describe('告警指纹'),
        },
        outputSchema: {
          code: z.number(),
          data: z.any().nullable(),
          msg: z.string(),
        }
      },
      async ({ appid, fp }, context) => {
        const summary = await request(
          appid,
          `/server/alert/history/list`,
          {
            method: 'get',
            params: {
              page: 1,
              size: 1,
              fingerprint: fp,
            }
          }
        )

        const error = await request(
          appid,
          `/server/record/errors`,
          {
            method: 'get',
            params: {
              page: 1,
              size: 1,
              fingerprint: fp,
            }
          }
        )
        console.log(summary, error, )

        return {
          content: [],
          structuredContent: {
            code: 0,
            data: {
              summary,
              error,
            },
            msg: '执行成功',
          }
        }
      }
    )
    return server;
};

// MCP POST endpoint with optional auth
const mcpPostHandler = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId) {
        console.log(`Received MCP request for session: ${sessionId}`);
    } else {
        console.log('Request body:', req.body);
    }

    try {
        let transport: StreamableHTTPServerTransport;
        if (sessionId && transports[sessionId]) {
            // Reuse existing transport
            transport = transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
            // New initialization request
            const eventStore = new InMemoryEventStore();
            transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
                eventStore, // Enable resumability
                onsessioninitialized: sessionId => {
                    // Store the transport by session ID when session is initialized
                    // This avoids race conditions where requests might come in before the session is stored
                    console.log(`Session initialized with ID: ${sessionId}`);
                    transports[sessionId] = transport;
                }
            });

            // Set up onclose handler to clean up transport when closed
            transport.onclose = () => {
                const sid = transport.sessionId;
                if (sid && transports[sid]) {
                    console.log(`Transport closed for session ${sid}, removing from transports map`);
                    delete transports[sid];
                }
            };

            // Connect the transport to the MCP server BEFORE handling the request
            // so responses can flow back through the same transport
            const server = getServer();
            await server.connect(transport);

            await transport.handleRequest(req, res, req.body);
            return; // Already handled
        } else {
            // Invalid request - no session ID or not initialization request
            res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: 'Bad Request: No valid session ID provided'
                },
                id: null
            });
            return;
        }

        // Handle the request with existing transport - no need to reconnect
        // The existing transport is already connected to the server
        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error'
                },
                id: null
            });
        }
    }
}
// Handle GET requests for SSE streams (using built-in support from StreamableHTTP)
const mcpGetHandler = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
    }

    // Check for Last-Event-ID header for resumability
    const lastEventId = req.headers['last-event-id'] as string | undefined;
    if (lastEventId) {
        console.log(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
    } else {
        console.log(`Establishing new SSE stream for session ${sessionId}`);
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
};

// Handle DELETE requests for session termination (according to MCP spec)
const mcpDeleteHandler = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
    }

    console.log(`Received session termination request for session ${sessionId}`);

    try {
        const transport = transports[sessionId];
        await transport.handleRequest(req, res);
    } catch (error) {
        console.error('Error handling session termination:', error);
        if (!res.headersSent) {
            res.status(500).send('Error processing session termination');
        }
    }
};

app.post('/mcp', mcpPostHandler);
app.get('/mcp', mcpGetHandler);
app.delete('/mcp', mcpDeleteHandler);

const MCP_PORT = 3000
app.listen(MCP_PORT, error => {
    if (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
    console.log(`MCP Streamable HTTP Server listening on port ${MCP_PORT}`);
});

// Handle server shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');

    // Close all active transports to properly clean up resources
    for (const sessionId in transports) {
        try {
            console.log(`Closing transport for session ${sessionId}`);
            await transports[sessionId].close();
            delete transports[sessionId];
        } catch (error) {
            console.error(`Error closing transport for session ${sessionId}:`, error);
        }
    }
    console.log('Server shutdown complete');
    process.exit(0);
});

async function request(appid: string, url: string, options: { method: string, body?: Record<string, any>, params?: Record<string, any> }) {
  const BASE_URL = process.env.SERVER_URL
  const qs = genQs(options.params)
  const _url = qs ? `${BASE_URL}${url}?${qs}` : `${BASE_URL}${url}`
  const res = await fetch(_url, {
    method: options.method,
    headers: {
      appid,
      'Content-Type': 'application/json',
      'x-internal-token': process.env.INTERNAL_TOKEN || ''
    },
    body: JSON.stringify(options.body),
  })
  return (await res.json()).data
}

function genQs(params?: Record<string, any>) {
  if (!params) return ''

  return Object.entries(params).reduce<string[]>((acc, [key, value]) => {
    acc.push(`${key}=${value}`)
    return acc
  }, []).join('&')
}
