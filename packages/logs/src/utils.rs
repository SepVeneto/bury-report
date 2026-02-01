use once_cell::sync::Lazy;
use regex::Regex;

static UUID_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[0-9a-zA-Z]{32}$").unwrap());

pub fn cal_md5(res: &str) -> String {
  let digest = md5::compute(res.as_bytes());

  format!("{:x}", digest).to_uppercase()
}

pub fn is_uuid(s: &str) -> bool {
    UUID_RE.is_match(s)
}

pub fn is_number(s: &str) -> bool {
    let bytes = s.as_bytes();
    if bytes.is_empty() {
        return false;
    }

    let start = if bytes[0] == b'-' {
        if bytes.len() == 1 {
            return false;
        }
        1
    } else {
        0
    };

    bytes[start..].iter().all(|s| s.is_ascii_digit())
}

// mod tests {
//     use super::*;

//     #[test]
//     fn test_tokenizer() {
//         let tokenizer = Tokenizer::new("routeDone with a webviewId 6 is not found");
//         let tokens = tokenizer.segments;
//         assert_eq!(tokens[0], Segment::Atom("routeDone"));
//         assert_eq!(tokens[1], Segment::Atom("with"));
//     }
// }
