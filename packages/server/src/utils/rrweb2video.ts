import { chromium } from 'playwright'
import * as path from '@std/path'
import * as fs from 'node:fs'
import { EventType, eventWithTime } from '@rrweb/types';

const MaxScaleValue = 2.5

const root = path.resolve(path.fromFileUrl(import.meta.resolve('rrweb-player')), '../../')
const rrwebScript = path.resolve(root, 'dist/index.js')
const rrwebStylePath = path.resolve(root, 'dist/style.css')
const rrwebRaw = fs.readFileSync(rrwebScript, 'utf-8')
const rrwebStyle = fs.readFileSync(rrwebStylePath, 'utf-8')

const config = {
  resolutionRatio: 0.8,
  rrwebPlayer: {
    width: 500,
    height: 500,
  },
  onProgressUpdate: (progress: number) => { console.log(progress)},
}
type Config = typeof config

function getHtml(events: eventWithTime[], config?: Config): string {
  return `
<html>
  <head>
  <style>${rrwebStyle}</style>
  <style>html, body {padding: 0; border: none; margin: 0;}</style>
  </head>
  <body>
  <div id="player"></div>
    <script>
      ${rrwebRaw};
      /*<!--*/
      const events = ${JSON.stringify(events).replace(
        /<\/script>/g,
        '<\\/script>',
      )};
      /*-->*/
      const userConfig = ${JSON.stringify(config?.rrwebPlayer || {})};
      try {
        window.replayer = new rrwebPlayer({
          target: document.getElementById('player'),
          props: {
            ...userConfig,
            events,
            showController: false,
            autoPlay: false,
          },
        });
        window.replayer.addEventListener('finish', () => window.onReplayFinish());
        window.replayer.addEventListener('ui-update-progress', (payload)=> window.onReplayProgressUpdate(payload));
        window.replayer.addEventListener('resize', () => document.querySelector('.replayer-wrapper').style.transform = 'scale(${
          (config?.resolutionRatio ?? 1) * MaxScaleValue
        }) translate(-50%, -50%)');
        // Start playback after event listeners are attached
        window.replayer.play();
      } catch (error) {
        console.error('Error initializing replayer:', error);
        window.onReplayFinish();
      }
    </script>
    <div style="width: 100px; height: 100px; background: crimson;"></div>
  </body>
</html>
`;
}

export async function transformToVideo(events: eventWithTime[], onUpdate: (process: any) => void) {
  const maxViewport = getMaxViewport(events)
  const scaledViewport = {
    width: Math.round(maxViewport.width * config.resolutionRatio * MaxScaleValue),
    height: Math.round(maxViewport.height * config.resolutionRatio * MaxScaleValue)
  }
  config.rrwebPlayer.width = scaledViewport.width
  config.rrwebPlayer.height = scaledViewport.height
  const browser = await chromium.launch({
    headless: true
  })
  const context = await browser.newContext({
    viewport: scaledViewport,
    recordVideo: {
      dir: '__video_temp__',
      size: scaledViewport,
    }
  })
  const page = await context.newPage()
  await page.goto('about:blank')

  page.on('console', msg => {
    console.log('[PAGE CONSOLE]', msg.type(), msg.text());
  })

  page.on('pageerror', error => {
    console.error('[PAGE ERROR]', error.message);
  })

  await page.exposeFunction(
    'onReplayProgressUpdate',
    (data: { payload: number }) => {
      onUpdate({ action: 'export', progress: data.payload })
      config?.onProgressUpdate(data.payload);
    },
  );

  await new Promise<void>((resolve, reject) => {
    const videoStartTime = events[0]?.timestamp
    const videoEndTime = events[events.length - 1]?.timestamp
    const videoDuration = videoEndTime - videoStartTime
    console.log(`[DEBUG] Expected playback time: ${videoDuration}ms`)
    page.exposeFunction('onReplayFinish', () => {
      console.log('[DEBUG] Replay finished');
      // clearTimeout(timeout);
      resolve()
    }).then(() => {
      return page.setContent(getHtml(events, config))
    }).then(() => {
      console.log('[DEBUG] Set content')
    }).catch((err) => {
      console.error('[DEBUG] Error setting page content: ', err)
      reject(err)
    })
  })
  const videPath = (await page.video()?.path()) || ''
  console.log(videPath)
  await context.close()
  browser.close()
}

/**
 * Preprocess all events to get a maximum view port size.
 */
function getMaxViewport(events: eventWithTime[]) {
  let maxWidth = 0,
    maxHeight = 0;
  events.forEach((event) => {
    if (event.type !== EventType.Meta) return;
    if (event.data.width > maxWidth) maxWidth = event.data.width;
    if (event.data.height > maxHeight) maxHeight = event.data.height;
  });
  return {
    width: maxWidth,
    height: maxHeight,
  };
}
