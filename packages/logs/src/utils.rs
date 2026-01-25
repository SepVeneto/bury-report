use once_cell::sync::Lazy;
use regex::Regex;


static UUID_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[0-9a-zA-Z]{32}$").unwrap());

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum  TokenKind {
    Word,
    Number,
    Uuid,
}

#[derive(Debug)]
pub struct Token<'a> {
    pub raw: &'a str,
    pub kind: TokenKind
}

pub struct Tokenizer<'a> {
    raw: String,
    pub tokens: Vec<Token<'a>>
}

impl Tokenizer<'_> {
    pub fn new(input: &str) -> Self {
        Self {
            raw: String::from(input),
            tokens: vec![]
        }
    }
    pub fn parse(&self) -> Vec<Token> {
        let chars: Vec<&str> = self.raw.split_whitespace().collect();
        chars.iter().map(|t| {
            Token {
                raw: t,
                kind: Self::classify(t)
            }
        }).collect()
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

mod tests {
    use super::*;

    #[test]
    fn test_tokenizer() {
        let tokenizer = Tokenizer::new("routeDone with a webviewId 6 is not found");
        let tokens = tokenizer.parse();
        assert_eq!(tokens[0].kind, TokenKind::Word);
        assert_eq!(tokens[1].kind, TokenKind::Word);
        assert_eq!(tokens[4].kind, TokenKind::Number);
    }
}
