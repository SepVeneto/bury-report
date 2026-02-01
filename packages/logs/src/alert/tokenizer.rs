use std::fmt::Debug;

use crate::utils::{is_uuid, is_number};


#[derive(Debug, PartialEq)]
pub enum Token<'a> {
    Atom(&'a str),
    Text(&'a str),
}


pub struct Tokenizer<'a> {
    pub tokens: Vec<Token<'a>>,
}

impl<'a> Debug for Tokenizer<'a> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_list().entries(&self.tokens).finish()
    }
}

impl <'a>Tokenizer<'a> {
    pub fn new(input: &'a str) -> Self {
        let ins = Self {
            tokens: Self::parse(input),
        };

        ins
    }

    fn parse(input: &'a str) -> Vec<Token<'a>> {
        let mut tokens= Vec::new();

        let mut start = 0;
        let mut is_atom = None;

        for (idx, ch) in input.char_indices() {
            let ch_is_atom = is_atom_char(input, idx, ch);

            match is_atom {
                None => {
                    is_atom = Some(ch_is_atom);
                }
                Some(prev) if prev != ch_is_atom => {
                    let s = &input[start..idx];
                    tokens.push(if prev {
                        Token::Atom(s)
                    } else {
                        Token::Text(s)
                    });
                    start = idx;
                    is_atom = Some(ch_is_atom);
                }
                _ => {}
            }
        }

        if start < input.len() {
            let s = &input[start..];
            tokens.push(if is_atom.unwrap_or(false) {
                Token::Atom(s)
            } else {
                Token::Text(s)
            });
        }

        tokens
    }


    pub fn normalize(&self) -> String {
        let mut str = String::new();
        for t in &self.tokens {
            match t {
                Token::Atom(a) => {
                    if is_uuid(a) {
                        str.push_str("<UUID>");
                    } else if is_number(a) {
                        str.push_str("<NUMBER>");
                    } else {
                        str.push_str(a);
                    }
                },
                Token::Text(t) => str.push_str(t),
            };
        }

        str
    }
}

#[inline]
fn is_atom_char(input: &str, idx: usize, ch: char) -> bool {
    // UTF-8 非 ASCII 一律视为 Atom（中文、emoji、全角符号等）

    if !ch.is_ascii() {
        return true;
    }

    // 负数：'-' 后面是数字
    if ch == '-' {
        if let Some(next) = input[idx + 1..].chars().next() {
            if next.is_ascii_digit() {
                return true;
            }
        }
    }

    // ASCII 字母数字 → Atom
    if ch.is_ascii_alphanumeric() {
        return true;
    }

    // 其余 ASCII 标点 → Text
    false
}

mod test {
    use super::*;

    #[test]
    fn test_common_tonkeizer() {
        let tokenizer = Tokenizer::new("routeDone with a webviewId 4 is not found");
        assert_eq!(tokenizer.tokens.len(), 15);
        assert_eq!(tokenizer.tokens[0], Token::Atom("routeDone"));
        assert_eq!(tokenizer.tokens[1], Token::Text(" "));
        assert_eq!(tokenizer.tokens[2], Token::Atom("with"));
        assert_eq!(tokenizer.tokens[3], Token::Text(" "));
        assert_eq!(tokenizer.tokens[4], Token::Atom("a"));
        assert_eq!(tokenizer.tokens[5], Token::Text(" "));
        assert_eq!(tokenizer.tokens[6], Token::Atom("webviewId"));
        assert_eq!(tokenizer.tokens[7], Token::Text(" "));
        assert_eq!(tokenizer.tokens[8], Token::Atom("4"));
        assert_eq!(tokenizer.tokens[9], Token::Text(" "));
        assert_eq!(tokenizer.tokens[10], Token::Atom("is"));
        assert_eq!(tokenizer.tokens[11], Token::Text(" "));
        assert_eq!(tokenizer.tokens[12], Token::Atom("not"));
        assert_eq!(tokenizer.tokens[13], Token::Text(" "));
        assert_eq!(tokenizer.tokens[14], Token::Atom("found"));
    }

    #[test]
    fn test_json_tokenizer() {
        let tokenizer = Tokenizer::new("{\"code\":-1,\"message\":\"UTF8编码是否落入Atom！\",\"timestamp\":1769409109,\"traceID\":\"417eaf98db47df984cdb0fff9f846f86\"}");
        use Token::*;

        assert_eq!(tokenizer.tokens.len(), 17);

        assert_eq!(tokenizer.tokens[0],  Text("{\""));
        assert_eq!(tokenizer.tokens[1],  Atom("code"));
        assert_eq!(tokenizer.tokens[2],  Text("\":"));
        assert_eq!(tokenizer.tokens[3],  Atom("-1"));
        assert_eq!(tokenizer.tokens[4],  Text(",\""));
        assert_eq!(tokenizer.tokens[5],  Atom("message"));
        assert_eq!(tokenizer.tokens[6],  Text("\":\""));
        assert_eq!(tokenizer.tokens[7],  Atom("UTF8编码是否落入Atom！"));
        assert_eq!(tokenizer.tokens[8],  Text("\",\""));
        assert_eq!(tokenizer.tokens[9],  Atom("timestamp"));
        assert_eq!(tokenizer.tokens[10], Text("\":"));
        assert_eq!(tokenizer.tokens[11], Atom("1769409109"));
        assert_eq!(tokenizer.tokens[12], Text(",\""));
        assert_eq!(tokenizer.tokens[13], Atom("traceID"));
        assert_eq!(tokenizer.tokens[14], Text("\":\""));
        assert_eq!(tokenizer.tokens[15], Atom("417eaf98db47df984cdb0fff9f846f86"));
        assert_eq!(tokenizer.tokens[16], Text("\"}"));
    }
}
