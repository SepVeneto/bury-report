self.onmessage = (evt) => {
  switch (evt.data.type) {
    case 'report':
      degradationReport(evt.data.body).finally(() => {
        self.postMessage('finish')
      })
      break
    default:
      console.warn('[@sepveneto/report-core] invalid event type: ' + evt.data.type)
  }
}

function degradationReport(body: any) {
  return self.fetch('BR_URL', {
    method: 'post',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
    cache: 'no-store',
    credentials: 'omit',
    signal: AbortSignal.timeout(3000),
    priority: 'low',
    body,
  })
}
