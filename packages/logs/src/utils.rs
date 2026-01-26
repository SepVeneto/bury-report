use once_cell::sync::Lazy;
use regex::Regex;


static UUID_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[0-9a-zA-Z]{32}$").unwrap());

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum  TokenKind {
    Word,
    Number,
    Uuid,
    Symbol,
}

#[derive(Debug)]
pub struct Token<'a> {
    pub raw: &'a str,
    pub kind: TokenKind,
    pub sep: Option<char>,
}

pub struct Tokenizer<'a> {
    pub tokens: Vec<Token<'a>>,
}

impl <'a>Tokenizer<'a> {
    pub fn new(input: &'a str) -> Self {
        let mut token_list = vec![];
        let mut start = None;
        let mut chars  = input.char_indices().peekable();

        while let Some((idx, ch)) = chars.next() {
            if ch.is_whitespace() {
                if let Some(s) = start.take() {
                    let end = idx;
                    token_list.push(Token {
                        raw: &input[s..end],
                        kind: Self::classify(&input[s..end]),
                        sep: Some(' '),
                    });
                }
                continue;
            }

            if is_delimiter(ch) {
                if let Some(s) = start.take() {
                    token_list.push(Token {
                        raw: &input[s..idx],
                        kind: Self::classify(&input[s..idx]),
                        sep: Some(ch),
                    });
                } else {
                    let end = idx + ch.len_utf8();
                    token_list.push(Token {
                        raw: &input[idx..idx + end],
                        kind: TokenKind::Symbol,
                        sep: None,
                    });
                }
                continue;
            }

            if ch == '"' {
                if let Some(s) = start.take() {
                    let end = read_string(input, &idx);
                    token_list.push(Token {
                        raw: &input[s..end],
                        kind: TokenKind::Word,
                        sep: Some(ch),
                    });
                }

                let start_str = idx;
                let mut end_str = idx + 1;

                while let Some(&(next_idx, next_ch)) = chars.peek() {
                    end_str = next_idx + next_ch.len_utf8();
                    chars.next();
                    if next_ch == '"' && input.as_bytes()[next_idx - 1] != b'\\' {
                        break;
                    }
                }
                token_list.push(Token {
                    raw: &input[start_str..end_str],
                    kind: TokenKind::Word,
                    sep: None,
                });
                continue;
            }

            if (start.is_none()) {
                start = Some(idx);
            }

            if chars.peek().is_none() {
                if let Some(s) = start.take() {
                    let end = idx + ch.len_utf8();
                    token_list.push(Token {
                        raw: &input[s..end],
                        kind: Self::classify(&input[s..end]),
                        sep: None,
                    });
                }
            }
        }

        Self {
            tokens: token_list,
        }
    }

    pub fn normalize(&self) -> String {
        let mut str = String::new();
        for t in self.tokens.iter() {
            let word = match t.kind {
                TokenKind::Uuid => "<UUID>",
                TokenKind::Number => "<NUMBER>",
                _ => &t.raw,
            };
            str.push_str(word);

            if let Some(sep) = t.sep {
                str.push(sep);
            }
        }

        str
    }

    fn classify(token: &str) -> TokenKind {
        if token.chars().all(|c| c.is_ascii_digit()) {
            TokenKind::Number
        } else if UUID_RE.is_match(token) {
            TokenKind::Uuid
        } else {
            TokenKind::Word
        }
    }
}

pub fn cal_md5(res: &str) -> String {
  let digest = md5::compute(res.as_bytes());

  format!("{:x}", digest).to_uppercase()
}

fn is_delimiter(c: char) -> bool {
    matches!(
        c,
        ' ' | ':' | ',' | '.' | '(' | ')' | '[' | ']' | '{' | '}' | '=' | '"' | '\''
    )
}

fn read_string(input: &str, start: &usize) -> usize {
    let bytes = input.as_bytes();
    let mut i = start + 1;

    while i < bytes.len() {
        match bytes[i] {
            b'"' | b'\'' => return i + 1,
            _ => i += 1,
        }
        i += 1;
    }
    bytes.len()
}

mod tests {
    use super::*;

    #[test]
    fn test_tokenizer() {
        let tokenizer = Tokenizer::new("routeDone with a webviewId 6 is not found");
        let tokens = tokenizer.tokens;
        assert_eq!(tokens[0].kind, TokenKind::Word);
        assert_eq!(tokens[1].kind, TokenKind::Word);
        assert_eq!(tokens[4].kind, TokenKind::Number);
    }
}
