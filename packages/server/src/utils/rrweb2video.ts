import { chromium } from 'playwright'
import * as path from '@std/path'
import * as fs from 'node:fs'
import { EventType, eventWithTime } from '@rrweb/types';
import { createDebug } from "./tools.ts";
import { spawn } from "node:child_process";
import { WriteStream } from "node:fs";

const MaxScaleValue = 2.5

const root = path.resolve(path.fromFileUrl(import.meta.resolve('rrweb-player')), '../../')
const rrwebScript = path.resolve(root, 'dist/index.js')
const rrwebStylePath = path.resolve(root, 'dist/style.css')
const rrwebRaw = fs.readFileSync(rrwebScript, 'utf-8')
const rrwebStyle = fs.readFileSync(rrwebStylePath, 'utf-8')

const debug = createDebug('video-transformer')

const defaultConfig = {
  resolutionRatio: 0.8,
  rrwebPlayer: {
    width: 500,
    height: 500,
    skipInactive: true,
  },
  onProgressUpdate: (_progress: number) => { },
}
type Config = typeof defaultConfig

export class VideoTransformer {
  private stage: 'generate' | 'transform' | 'success' | 'fail' | 'idle' = 'idle'
  private progress = 0
  private chunks: string[] = []

  public config: Config

  private file: WriteStream

  constructor(config?: Config) {
    this.config = {
      ...defaultConfig,
      ...(config || {}),
    }
    this.file = fs.createWriteStream('output.mp4')
  }

  get state() {
    const chunks = [...this.chunks]
    this.chunks.length = 0
    return {
      action: this.stage,
      progress: this.progress,
      chunks,
    }
  }

  private async genVideo(events: eventWithTime[]) {
    const config = this.config
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
      debug(msg.type(), msg.text())
    })

    page.on('pageerror', error => {
      debug('[PAGE ERROR]', error.message)
    })

    await page.exposeFunction(
      'onReplayProgressUpdate',
      (data: { payload: number }) => {
        this.config.onProgressUpdate(data.payload)
        this.stage = 'generate'
        this.progress = data.payload
      },
    );

    await new Promise<void>((resolve, reject) => {
      const videoStartTime = events[0]?.timestamp
      const videoEndTime = events[events.length - 1]?.timestamp
      const videoDuration = videoEndTime - videoStartTime
      debug(`Expected playback time: ${videoDuration}ms`)
      page.exposeFunction('onReplayFinish', () => {
        console.log('[DEBUG] Replay finished');
        // clearTimeout(timeout);
        resolve()
      }).then(() => {
        return page.setContent(getHtml(events, config))
      }).then(() => {
        debug('Set content')
      }).catch((err) => {
        debug('Error setting page content: ', err)
        reject(err)
      })
    })
    const videoPath = (await page.video()?.path()) || ''
    await context.close()
    browser.close()
    return videoPath
  }

  async transform(events: eventWithTime[]) {
    const videoPath = await this.genVideo(events)
    return this.toMp4(videoPath)
  }

  private toMp4(videoPath: string) {
    return new Promise((resolve, reject) => {
      const args = [
        '-i', videoPath,
        '-vcodec', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-crf', '23',
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        'pipe:1',
      ]
      const ffmpeg = spawn('ffmpeg', args)
      ffmpeg.stdout.pipe(this.file)
      ffmpeg.stderr.on('data', (data) => {
        if (data.includes('Error')) {
          console.error(`[FFMPEG] ${data}`)
          this.stage = 'fail'
          reject(data)
        }
      })
      ffmpeg.stdout.on('data', (data) => {
        this.stage = 'transform'
        this.chunks.push(data)
      })
      ffmpeg.stdout.on('end', () => {
        console.log('end')
      })
      ffmpeg.on('close', () => {
        console.log('close')

        fs.unlinkSync(videoPath)
        resolve(true)
      })
    })
  }
}


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
