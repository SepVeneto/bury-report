interface ImportMetaEnv extends Readonly<Record<string, string>> {
  readonly VITE_APP_BASEURL: string
  readonly VITE_APP_TITLE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  __MICRO_APP_ENVIRONMENT__?: boolean
  __MICRO_APP_BASE_APPLICATION__?: boolean
  microApp?: import('@micro-zoe/micro-app').EventCenterForMicroApp
}
