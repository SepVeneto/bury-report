use std::fmt::{Debug, Display};
use log::debug;

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

pub struct Token<'a> {
    pub raw: &'a str,
    pub kind: TokenKind,
    pub sep: &'a str,
}

impl<'a> Debug for Token<'a> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Token")
            .field("raw", &self.raw)
            .field("kind", &self.kind)
            .field("sep", &self.sep)
            .finish()
    }
}

#[derive(Debug)]
pub enum Segment<'a> {
    Atom(&'a str),
    Text(&'a str),
}


pub struct Tokenizer<'a> {
    pub input: &'a str,
    pub tokens: Vec<Token<'a>>,
}

impl<'a> Debug for Tokenizer<'a> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_list().entries(&self.tokens).finish()
    }
}

impl<'a> Display for Tokenizer<'a> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        for t in &self.tokens {
            let _ = write!(f, "{}", t.raw);
            let _ = write!(f, "{}", t.sep);
        }
        Ok(())
    }
}

impl <'a>Tokenizer<'a> {
    pub fn new(input: &'a str) -> Self {
        let ins = Self {
            input,
            tokens: vec![],
        };
        let segs = ins.segment();

        debug!("{:?}", segs);

        ins
    }

    fn segment(&self) -> Vec<Segment<'a>> {
        let mut segments = Vec::new();

        let mut start = 0;
        let mut is_atom = None;

        for (idx, ch) in self.input.char_indices() {
            let ch_is_atom = ch.is_ascii_alphanumeric();

            match is_atom {
                None => {
                    is_atom = Some(ch_is_atom);
                }
                Some(prev) if prev != ch_is_atom => {
                    let s = &self.input[start..idx];
                    segments.push(if prev {
                        Segment::Atom(s)
                    } else {
                        Segment::Text(s)
                    });
                    start = idx;
                    is_atom = Some(ch_is_atom);
                }
                _ => {}
            }
        }

        if start < self.input.len() {
            let s = &self.input[start..];
            segments.push(if is_atom.unwrap_or(false) {
                Segment::Atom(s)
            } else {
                Segment::Text(s)
            });
        }

        segments
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

            str.push_str(t.sep);
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
