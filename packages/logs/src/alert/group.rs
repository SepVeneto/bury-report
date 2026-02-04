use bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

use crate::{alert::tokenizer::Token, utils::{cal_md5, is_number, is_uuid}};

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type", content = "value")]
pub enum PatternType {
    Literal(String),
    Number,
    Uuid,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct GroupPattern {
    pub fp: String,
    pub condition: Vec<PatternType>,
}
impl GroupPattern {
    pub fn new (id: ObjectId, list: Vec<PatternType>) -> Self {
        let id_str = id.to_hex();
        println!("id: {}, md5: {:?}", id_str, cal_md5(&id_str));
        GroupPattern {
            fp: cal_md5(&id_str),
            condition: list,
        }
    }

    pub fn is_match(&self, segments: &Vec<Token>) -> bool {
        let pattern = &self.condition;
        let mut p = 0;

        for seg in segments {
            if Self::match_segment(seg, &self.condition[p]) {
                p += 1;
                if p == pattern.len() {
                    return true;
                }
            }
        }
        false
    }
    fn match_segment(seg: &Token, pat: &PatternType) -> bool { 
        match (seg, pat) {
            (Token::Atom(a), PatternType::Literal(s)) => a == s,
            (Token::Text(t), PatternType::Literal(s)) => t.contains(s),

            (Token::Atom(a), PatternType::Number) => is_number(a),
            (Token::Atom(a), PatternType::Uuid) => is_uuid(a),
            
            _ => false,
        }
    }

}

