#!/usr/bin/env python3
"""带空闲回收的 TCP 代理，用于模拟"前面挂了会主动关空闲连接的 LB/代理"。

用法: python3 tcp_idle_proxy.py <listen_port> <upstream_host> <upstream_port> [idle_seconds]
空闲超过 idle_seconds 的连接会被代理主动关闭（向客户端发 FIN），
用来观察 MongoDB 驱动是否会把这些连接滞留在 CLOSE_WAIT。
"""
import asyncio
import os
import sys
import time

downstream_count = 0
closed_idle = 0


async def pump(reader, writer, refresh, delay):
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            refresh[0] = time.monotonic()
            if delay:
                await asyncio.sleep(delay)
            writer.write(data)
            await writer.drain()
    except Exception:
        pass
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def handle(client_reader, client_writer, upstream, idle, delay):
    global downstream_count, closed_idle
    downstream_count += 1
    try:
        up_reader, up_writer = await asyncio.open_connection(*upstream)
    except Exception:
        client_writer.close()
        return

    refresh = [time.monotonic()]

    async def reap():
        global closed_idle
        while True:
            await asyncio.sleep(0.5)
            if time.monotonic() - refresh[0] > idle:
                closed_idle += 1
                up_writer.close()
                client_writer.close()
                return

    await asyncio.gather(
        pump(client_reader, up_writer, refresh, delay),
        pump(up_reader, client_writer, refresh, delay),
        reap(),
        return_exceptions=True,
    )


async def main():
    listen_port = int(sys.argv[1])
    upstream = (sys.argv[2], int(sys.argv[3]))
    idle = float(sys.argv[4]) if len(sys.argv) > 4 else 3.0
    delay = float(sys.argv[5]) / 1000.0 if len(sys.argv) > 5 else 0.0

    async def stats():
        while True:
            await asyncio.sleep(10)
            print(f"[proxy] total={downstream_count} idle_closed={closed_idle}", flush=True)

    asyncio.create_task(stats())
    with open("/tmp/logs-test/proxy.pid", "w") as fh:
        fh.write(str(os.getpid()))
    server = await asyncio.start_server(
        lambda r, w: handle(r, w, upstream, idle, delay), "127.0.0.1", listen_port
    )
    print(f"[proxy] listen 127.0.0.1:{listen_port} -> {upstream[0]}:{upstream[1]} idle={idle}s delay={delay*1000:.0f}ms", flush=True)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
