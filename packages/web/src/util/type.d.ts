import { AxiosRequestConfig } from 'axios';

declare interface ApiResponseType {
  code: number;
  data: any;
  msg: string;
}

declare interface RequestConfig extends AxiosRequestConfig {
  filename?: string;
}
