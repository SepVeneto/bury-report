use bson::oid::ObjectId;
use once_cell::sync::Lazy;
use regex::Regex;
use crate::{alert::group::GroupPattern, model::{QueryBase, alert_fact, alert_rule::{self, AlertNotify, AlertSource, AlertStrategy, CollectionRule, CollectionType, FingerprintRule, TypeRule}, alert_summary, logs_error}};
use dashmap::DashMap;
use std::sync::Arc;

type AppId = String;
pub type ErrorRaw = logs_error::Model;

pub type ErrorSummary = alert_summary::Model;
type AlertRule = alert_rule::Model;

pub struct AppSummary {
    pub summaries: DashMap<String, ErrorSummary>,
}

pub type AlertFactInfo = alert_fact::Model;
pub struct AlertFact {
    pub map: DashMap<String, AlertFactInfo>
}

pub static SUMMARY_MAP: Lazy<DashMap<AppId, AppSummary>> = Lazy::new(|| DashMap::new());

pub static RULE_MAP: Lazy<DashMap<AppId, AlertRuleMap>> = Lazy::new(|| DashMap::new());
pub static ALERT_MAP: Lazy<DashMap<AppId, AlertFact>> = Lazy::new(|| DashMap::new());
// pub static FP_MAP: Lazy<DashMap<AppId, DashSet<String>>> = Lazy::new(|| DashMap::new());

pub static LINE_COL_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r":\d+:\d+").unwrap());
pub static QUERY_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\?[^)]*").unwrap());

pub struct AlertRuleMap {
    pub collection: DashMap<CollectionType, CollectionRule>,
    pub fingerprints: DashMap<String, FingerprintRule>,
    pub types: DashMap<String, TypeRule>,
    pub group: DashMap<String, Arc<Vec<GroupPattern>>>,
}
impl AlertRuleMap {
    pub fn from_models(models: Vec<QueryBase<AlertRule>>) -> Self {
        let collection = DashMap::new();
        let fingerprints = DashMap::new();
        let types = DashMap::new();
        let group = DashMap::new();

        let mut group_pattern = vec![];

        for model in models {
            match model.model.source {
                AlertSource::Collection { ref log_type } => {
                    let rule = CollectionRule {
                        id: model._id,
                        name: model.model.name,
                        enabled: model.model.enabled,
                        notify: model.model.notify,
                        log_type: log_type.clone(),
                    };
                    collection.insert(log_type.clone(), rule);
                }
                AlertSource::Fingerprint { fingerprint } => {
                    let rule = FingerprintRule {
                        id: model._id,
                        name: model.model.name,
                        enabled: model.model.enabled,
                        notify: model.model.notify,
                    };
                    fingerprints.insert(fingerprint, rule);
                }
                AlertSource::Group { condition } => {
                    let rule = FingerprintRule {
                        id: model._id,
                        name: model.model.name,
                        enabled: model.model.enabled,
                        notify: model.model.notify,
                    };
                    let pattern = GroupPattern::new(model._id, condition);
                    group_pattern.push(pattern.clone());
                    fingerprints.insert(pattern.fp, rule);
                }
            }
        }

        // let group_patterns = group_condition.iter().map(|(condition)| )
        group.insert("pattern".to_string(), Arc::new(group_pattern));
        Self { collection, fingerprints, types, group }
    }
}

pub enum UnionRule {
    Collection(CollectionRule),
    Fingerprint(FingerprintRule),
    TypeRule(TypeRule),
}
impl UnionRule {
    pub fn id(&self) -> ObjectId {
        match self {
            UnionRule::Collection(rule) => rule.id,
            UnionRule::Fingerprint(rule) => rule.id,
            UnionRule::TypeRule(rule) => rule.id,
        }
    }
    pub fn strategy(&self) -> AlertStrategy {
        match self {
            UnionRule::Collection(rule) => rule.notify.strategy(),
            UnionRule::Fingerprint(rule) => rule.notify.strategy(),
            UnionRule::TypeRule(rule) => rule.notify.strategy(),
        }
    }

    pub fn ttl(&self) -> Option<i64> {
        match self {
            UnionRule::Collection(rule) => rule.notify.ttl(),
            UnionRule::Fingerprint(rule) => rule.notify.ttl(),
            UnionRule::TypeRule(rule) => rule.notify.ttl(),
        }
    }

    pub fn url(&self) -> Option<String> {
        match self {
            UnionRule::Collection(rule) => rule.notify.url(),
            UnionRule::Fingerprint(rule) => rule.notify.url(),
            UnionRule::TypeRule(rule) => rule.notify.url(),
        }
    }
    
    pub fn notify(&self) -> AlertNotify {
        match self {
            UnionRule::Collection(rule) => rule.notify.clone(),
            UnionRule::Fingerprint(rule) => rule.notify.clone(),
            UnionRule::TypeRule(rule) => rule.notify.clone(),
        }
    }

    pub fn type_human_readable(&self) -> String {
        match self {
            UnionRule::Collection(rule) => {
                match rule.log_type {
                    CollectionType::Error => "错误日志",
                    CollectionType::Networ => "网络日志",
                    CollectionType::Custom => "上报日志",
                }
            },
            UnionRule::Fingerprint(_) => "指纹",
            UnionRule::TypeRule(_) => "类型",
        }.into()
    }

    pub fn name(&self) -> String {
        match self {
            UnionRule::Collection(rule) => rule.name.clone(),
            UnionRule::Fingerprint(rule) => rule.name.clone(),
            UnionRule::TypeRule(rule) => rule.name.clone(),
        }
    }
}


