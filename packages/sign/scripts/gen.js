const { sign, gen_nonce } = require('../pkg/sign')
const postData = {
  platform: 'linux',
  appid: '6582a4d40502898969c7ecc1',
  nonce: gen_nonce(),
}

const signstr = sign(JSON.stringify(postData), '383ea404022aeb571f5294da70c6c471')

console.log(postData, signstr)
