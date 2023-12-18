use std::collections::BTreeMap;

use serde_json::{from_str, Value};
use wasm_bindgen::prelude::*;
use js_sys::Math;
use md5;

#[wasm_bindgen]
pub fn sign(params: &str, secret: &str) -> JsValue {
  let json = from_str(params).expect("params must be a string which can be converted to a JSON");
  match json {
    Value::Object(obj) => {
      let sort_str = sort(Value::Object(obj));
      let md5_str = cal_md5(format!("{}{}", sort_str, secret));
      JsValue::from(md5_str)
    },
    _ => JsValue::NULL,
  }
}

fn sort(params: Value) -> String {
  match params {
    Value::Array(arr) => {
      let mut keys = Vec::<String>::new();
      
      for item in arr {
        keys.push(sort(item));
      }
      keys.join("")
    }
    Value::Object(obj) => {
      let mut sorted_obj = BTreeMap::<String, Value>::new();
      for (key, value) in obj {
        sorted_obj.insert(key, value);
      }

      let mut keys = Vec::<String>::new();
      for (key, value) in sorted_obj {
        let value = match value {
          Value::Array(_) | Value::Object(_) => sort(value),
          _ => format!("{}={}&", key, value)
        };
        keys.push(value);
      }
      keys.join("")
    }
    Value::Bool(bool) => bool.to_string(),
    Value::Number(num) => num.to_string(),
    Value::String(str) => str,
    Value::Null => String::from(""),
  }
}

fn substr(str: &str, start: usize, offset: usize) -> String {
  return String::from(&str[start..start + offset]);
}
#[wasm_bindgen]
pub fn gen_nonce() -> String {
  let mut s: Vec<String> = Vec::with_capacity(32);
  const HEX_DIGITS: &str = "0123456789abcdef";

  // let mut rng = rand::thread_rng();
  for _i in 0..32 {
    // s.push(substr(HEX_DIGITS, rng.gen_range(0..HEX_DIGITS.len()), 1));
    let start = Math::floor(Math::random() * HEX_DIGITS.len() as f64) as usize;
    s.push(substr(HEX_DIGITS, start, 1))
  }

  s[14] = "4".to_string();

  {
    let start = match s[19].parse::<usize>() {
      Ok(res) => res,
      _ => 'f' as usize,
    };
    s[19] = substr(&HEX_DIGITS, start & 0x3 | 0x8, 1);
  }

  {
    s[8] = s[23].clone();
    s[13] = s[23].clone();
    s[18] = s[23].clone();
  }
  return s.join("");
}

fn cal_md5(res: String) -> String {
  let digest = md5::compute(res.as_bytes());

  format!("{:x}", digest).to_uppercase()
}
