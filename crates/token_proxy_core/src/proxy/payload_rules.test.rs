use super::*;

use crate::proxy::config::{
    PayloadFilterRuleSet, PayloadParamRule, PayloadRulesConfig, PayloadValueRuleSet,
    PayloadValueType,
};
use serde_json::json;

fn sample_rules() -> PayloadRulesConfig {
    PayloadRulesConfig {
        r#default: vec![PayloadValueRuleSet {
            models: vec!["gpt-5.4".to_string()],
            params: vec![
                PayloadParamRule {
                    path: "instructions".to_string(),
                    value_type: PayloadValueType::String,
                    value: json!("You are an IT software development expert"),
                },
                PayloadParamRule {
                    path: "reasoning.effort".to_string(),
                    value_type: PayloadValueType::String,
                    value: json!("medium"),
                },
            ],
        }],
        r#override: vec![PayloadValueRuleSet {
            models: vec!["gpt-5.4".to_string()],
            params: vec![
                PayloadParamRule {
                    path: "service_tier".to_string(),
                    value_type: PayloadValueType::String,
                    value: json!("priority"),
                },
                PayloadParamRule {
                    path: "metadata".to_string(),
                    value_type: PayloadValueType::Json,
                    value: json!({ "source": "token_proxy" }),
                },
            ],
        }],
        filter: vec![PayloadFilterRuleSet {
            models: vec!["gpt-5.4".to_string()],
            paths: vec!["reasoning.summary".to_string()],
        }],
    }
}

#[test]
fn payload_rules_apply_filter_default_and_override_in_order() {
    let mut value = json!({
        "model": "gpt-5.4",
        "reasoning": {
            "summary": "verbose"
        }
    });

    let changed = apply_payload_rules_to_value(&mut value, Some("gpt-5.4"), &sample_rules());

    assert!(changed);
    assert_eq!(
        value,
        json!({
            "model": "gpt-5.4",
            "instructions": "You are an IT software development expert",
            "reasoning": {
                "effort": "medium"
            },
            "service_tier": "priority",
            "metadata": {
                "source": "token_proxy"
            }
        })
    );
}

#[test]
fn payload_rules_do_not_override_existing_default_values() {
    let mut value = json!({
        "instructions": "keep me"
    });

    let changed = apply_payload_rules_to_value(
        &mut value,
        Some("gpt-5.4"),
        &PayloadRulesConfig {
            r#default: vec![PayloadValueRuleSet {
                models: vec!["gpt-5.4".to_string()],
                params: vec![PayloadParamRule {
                    path: "instructions".to_string(),
                    value_type: PayloadValueType::String,
                    value: json!("new value"),
                }],
            }],
            ..PayloadRulesConfig::default()
        },
    );

    assert!(!changed);
    assert_eq!(value["instructions"], json!("keep me"));
}

#[test]
fn payload_rules_ignore_non_matching_models() {
    let mut value = json!({
        "service_tier": "standard"
    });

    let changed = apply_payload_rules_to_value(&mut value, Some("gpt-5.2"), &sample_rules());

    assert!(!changed);
    assert_eq!(value["service_tier"], json!("standard"));
}

#[test]
fn payload_rules_can_write_boolean_and_number_values() {
    let mut value = json!({});
    let rules = PayloadRulesConfig {
        r#override: vec![PayloadValueRuleSet {
            models: vec!["gpt-5.4".to_string()],
            params: vec![
                PayloadParamRule {
                    path: "stream".to_string(),
                    value_type: PayloadValueType::Boolean,
                    value: json!(true),
                },
                PayloadParamRule {
                    path: "temperature".to_string(),
                    value_type: PayloadValueType::Number,
                    value: json!(0.2),
                },
            ],
        }],
        ..PayloadRulesConfig::default()
    };

    let changed = apply_payload_rules_to_value(&mut value, Some("gpt-5.4"), &rules);

    assert!(changed);
    assert_eq!(value["stream"], json!(true));
    assert_eq!(value["temperature"], json!(0.2));
}
