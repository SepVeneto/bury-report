import { report } from '../src/lib'

document.getElementById('app')!.innerHTML = '__UNPLUGIN__'

report('error', { platform: 'linux' })
