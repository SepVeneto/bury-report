# 埋点上报

## redpanda
```shell
docker exec -it redpanda-0 bash
rpk topic create rrweb
```

## 服务端

### 管理服务

### 上报服务

环境：2C4G

nodejs实现
```cmd
This is ApacheBench, Version 2.3 <$Revision: 1903618 $>
Copyright 1996 Adam Twiss, Zeus Technology Ltd, http://www.zeustech.net/
Licensed to The Apache Software Foundation, http://www.apache.org/

Benchmarking 10.7.12.26 (be patient)
Completed 2000 requests
Completed 4000 requests
Completed 6000 requests
Completed 8000 requests
Completed 10000 requests
Completed 12000 requests
Completed 14000 requests
Completed 16000 requests
Completed 18000 requests
Completed 20000 requests
Finished 20000 requests


Server Software:
Server Hostname:        10.7.12.26
Server Port:            8878

Document Path:          /record
Document Length:        30 bytes

Concurrency Level:      15000
Time taken for tests:   29.430 seconds
Complete requests:      20000
Failed requests:        0
Total transferred:      3440000 bytes
Total body sent:        4320000
HTML transferred:       600000 bytes
Requests per second:    679.57 [#/sec] (mean)
Time per request:       22072.660 [ms] (mean)
Time per request:       1.472 [ms] (mean, across all concurrent requests)
Transfer rate:          114.15 [Kbytes/sec] received
                        143.35 kb/s sent
                        257.49 kb/s total

Connection Times (ms)
              min  mean[+/-sd] median   max
Connect:        0    1  31.0      1    3016
Processing:   464 10277 7233.2   8473   25589
Waiting:        7 7847 7073.0   4656   25266
Total:        465 10278 7234.0   8474   25590

Percentage of the requests served within a certain time (ms)
  50%   8474
  66%  13838
  75%  18168
  80%  18336
  90%  19425
  95%  22961
  98%  25382
  99%  25475
 100%  25590 (longest request)
```

rust实现
>ab -c 15000 -n 20000 -T application/json -p D:/post.json http://10.7.12.26:8870/record
```cmd
This is ApacheBench, Version 2.3 <$Revision: 1903618 $>
Copyright 1996 Adam Twiss, Zeus Technology Ltd, http://www.zeustech.net/
Licensed to The Apache Software Foundation, http://www.apache.org/

Benchmarking 10.7.12.26 (be patient)
Completed 2000 requests
Completed 4000 requests
Completed 6000 requests
Completed 8000 requests
Completed 10000 requests
Completed 12000 requests
Completed 14000 requests
Completed 16000 requests
Completed 18000 requests
Completed 20000 requests
Finished 20000 requests


Server Software:
Server Hostname:        10.7.12.26
Server Port:            8870

Document Path:          /record
Document Length:        35 bytes

Concurrency Level:      15000
Time taken for tests:   20.757 seconds
Complete requests:      20000
Failed requests:        0
Total transferred:      2860000 bytes
Total body sent:        4320000
HTML transferred:       700000 bytes
Requests per second:    963.52 [#/sec] (mean)
Time per request:       15567.979 [ms] (mean)
Time per request:       1.038 [ms] (mean, across all concurrent requests)
Transfer rate:          134.55 [Kbytes/sec] received
                        203.24 kb/s sent
                        337.80 kb/s total

Connection Times (ms)
              min  mean[+/-sd] median   max
Connect:        0    1  17.5      0    1014
Processing:   421 9458 2947.1   9730   13571
Waiting:        7 5321 3330.1   4766   13283
Total:        422 9459 2946.8   9731   13572

Percentage of the requests served within a certain time (ms)
  50%   9731
  66%  11010
  75%  11991
  80%  12500
  90%  13241
  95%  13332
  98%  13405
  99%  13511
 100%  13572 (longest request)
```
