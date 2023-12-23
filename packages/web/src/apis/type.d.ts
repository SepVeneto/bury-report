declare global {
  interface resetPasswordReq {
    password_old: string,
    password: string,
    id: number,
  }
  namespace Login {
    interface Req {
      username: string;
      password: string;
      verify_key: string;
      verify_code: string;
    }
    interface Res {
      token: string,
    }
    interface VerifyCode {
      verify_image: string,
      verify_key: string,
    }
  }
  namespace Menu {
    type Req = string
    interface Menu {
      id: number;
      pid: number;
      name: string;
      route: string;
      path: string;
      icon: string;
      sort: number;
      is_on: Status;
      sub_list?: Menu[];
    }
  }
}
