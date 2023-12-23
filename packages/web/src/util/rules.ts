export function checkPass(rule: any, value: string, cb: any) {
  const regexp = /^(?![a-zA-Z]+$)(?![A-Z0-9]+$)(?![A-Z,.:;，。？''""；；‘’“”·、_~!@#$^&*()<>{}【】|?/+=-]+$)(?![a-z0-9]+$)(?![a-z,.:;，。？''""；；‘’“”_~!@#$^&*()<>{}【】|?/+=-]+$)(?![0-9,.:;，。？''""；；‘’“”_~!@#$^&*()<>{}【】|?/+=-]+$)[a-zA-Z0-9,.:;，。？''""；；‘’“”_~!@#$^&*()<>{}【】|?/+=-]{6,16}$/
  if (!value) {
    cb(new Error('请输入密码'))
  } else if (!regexp.test(value)) {
    cb(new Error('密码应为6-16位数字、字母、特殊符号组合'))
  } else {
    cb();
  }
}

export function required(label: string) {
  return { required: true, message: '请补充' + label }
}

export function checkPhone(rule: any, value: string, cb: any) {
  const regexp = /^(13[0-9]|14[01456879]|15[0-35-9]|16[2567]|17[0-8]|18[0-9]|19[0-35-9])\d{8}$/
  if (!value) {
    cb(new Error('请输入手机号'))
  } else if (!regexp.test(value)) {
    cb(new Error('请输入合法的手机号'))
  } else {
    cb()
  }
}

export function checkFill(rule: any, value: any, cb: any) {
  if (value) {
    return cb()
  }
}