#!/usr/bin/env python3
"""统计某个进程的 FD / socket 及其 TCP 状态（用于句柄泄漏回归）。

用法: python3 fdstat.py <pid>
输出: JSON
"""
import json
import os
import sys

STATES = {
    "01": "ESTABLISHED", "02": "SYN_SENT", "03": "SYN_RECV", "04": "FIN_WAIT1",
    "05": "FIN_WAIT2", "06": "TIME_WAIT", "07": "CLOSE", "08": "CLOSE_WAIT",
    "09": "LAST_ACK", "0A": "LISTEN", "0B": "CLOSING",
}


def main() -> int:
    pid = sys.argv[1]
    fd_dir = f"/proc/{pid}/fd"
    try:
        fds = os.listdir(fd_dir)
    except OSError as exc:
        print(json.dumps({"error": str(exc)}))
        return 1

    socket_inodes = set()
    for fd in fds:
        try:
            target = os.readlink(f"{fd_dir}/{fd}")
        except OSError:
            continue
        if target.startswith("socket:["):
            socket_inodes.add(target[8:-1])

    inode_state = {}
    for path in (f"/proc/{pid}/net/tcp", f"/proc/{pid}/net/tcp6"):
        try:
            with open(path) as fh:
                next(fh, None)
                for line in fh:
                    parts = line.split()
                    if len(parts) < 10:
                        continue
                    inode_state[parts[9]] = STATES.get(parts[3], parts[3])
        except OSError:
            pass

    by_state = {}
    for inode in socket_inodes:
        state = inode_state.get(inode, "UNKNOWN")
        by_state[state] = by_state.get(state, 0) + 1

    rss = 0
    try:
        with open(f"/proc/{pid}/status") as fh:
            for line in fh:
                if line.startswith("VmRSS:"):
                    rss = int(line.split()[1])
    except OSError:
        pass

    print(json.dumps({
        "pid": int(pid),
        "fds": len(fds),
        "sockets": len(socket_inodes),
        "rss_kb": rss,
        "tcp_states": dict(sorted(by_state.items(), key=lambda kv: -kv[1])),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
