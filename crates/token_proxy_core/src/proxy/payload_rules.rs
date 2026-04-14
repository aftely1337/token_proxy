use serde_json::{map::Entry, Map, Value};

use super::{
    config::{
        PayloadFilterRuleSet, PayloadParamRule, PayloadRulesConfig, PayloadValueRuleSet,
        PayloadValueType,
    },
    request_body::ReplayableBody,
    RequestMeta,
};

pub(crate) fn validate_payload_rules_config(rules: &PayloadRulesConfig) -> Result<(), String> {
    validate_value_rule_sets("default", &rules.r#default)?;
    validate_value_rule_sets("override", &rules.r#override)?;
    validate_filter_rule_sets(&rules.filter)?;
    Ok(())
}

pub(crate) async fn maybe_apply_payload_rules(
    body: &ReplayableBody,
    meta: &RequestMeta,
    rules: &PayloadRulesConfig,
    limit_bytes: usize,
) -> Result<Option<ReplayableBody>, String> {
    let Some(model) = meta.original_model.as_deref().map(str::trim).filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };
    if is_rules_empty(rules) {
        return Ok(None);
    }

    let Some(bytes) = body
        .read_bytes_if_small(limit_bytes)
        .await
        .map_err(|err| format!("Failed to read cached request body: {err}"))?
    else {
        return Ok(None);
    };

    let Ok(mut value) = serde_json::from_slice::<Value>(&bytes) else {
        return Ok(None);
    };
    if !apply_payload_rules_to_value(&mut value, Some(model), rules) {
        return Ok(None);
    }

    let output = serde_json::to_vec(&value)
        .map_err(|err| format!("Failed to serialize request body with payload rules: {err}"))?;
    Ok(Some(ReplayableBody::from_bytes(output.into())))
}

pub(crate) fn apply_payload_rules_to_value(
    value: &mut Value,
    model: Option<&str>,
    rules: &PayloadRulesConfig,
) -> bool {
    let Some(model) = model.map(str::trim).filter(|value| !value.is_empty()) else {
        return false;
    };
    let Some(object) = value.as_object_mut() else {
        return false;
    };

    let mut changed = false;
    for rule_set in &rules.filter {
        if !model_matches_filter_rule_set(model, rule_set) {
            continue;
        }
        for path in &rule_set.paths {
            changed |= remove_path(object, path);
        }
    }

    for rule_set in &rules.r#default {
        if !model_matches_rule_set(model, rule_set) {
            continue;
        }
        for param in &rule_set.params {
            changed |= set_default_path(object, param);
        }
    }

    for rule_set in &rules.r#override {
        if !model_matches_rule_set(model, rule_set) {
            continue;
        }
        for param in &rule_set.params {
            changed |= set_override_path(object, param);
        }
    }

    changed
}

pub(crate) fn model_matches_rule_set(model: &str, rule_set: &PayloadValueRuleSet) -> bool {
    rule_set.models.iter().any(|candidate| candidate.trim() == model)
}

fn model_matches_filter_rule_set(model: &str, rule_set: &PayloadFilterRuleSet) -> bool {
    rule_set.models.iter().any(|candidate| candidate.trim() == model)
}

fn is_rules_empty(rules: &PayloadRulesConfig) -> bool {
    rules.r#default.is_empty() && rules.r#override.is_empty() && rules.filter.is_empty()
}

fn split_simple_path(path: &str) -> Option<Vec<&str>> {
    let segments = path
        .split('.')
        .map(str::trim)
        .collect::<Vec<_>>();
    if segments.is_empty() || segments.iter().any(|segment| segment.is_empty()) {
        return None;
    }
    Some(segments)
}

fn is_valid_path_segment(segment: &str) -> bool {
    !segment.is_empty()
        && segment
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
}

fn validate_value_rule_sets(
    kind: &str,
    rule_sets: &[PayloadValueRuleSet],
) -> Result<(), String> {
    for (rule_index, rule_set) in rule_sets.iter().enumerate() {
        if !rule_set
            .models
            .iter()
            .any(|candidate| !candidate.trim().is_empty())
        {
            return Err(format!("{kind} rule {} requires at least one model.", rule_index + 1));
        }
        if rule_set.params.is_empty() {
            return Err(format!(
                "{kind} rule {} requires at least one parameter.",
                rule_index + 1
            ));
        }
        for (param_index, param) in rule_set.params.iter().enumerate() {
            let Some(segments) = split_simple_path(&param.path) else {
                return Err(format!(
                    "{kind} rule {} parameter {} has an invalid path.",
                    rule_index + 1,
                    param_index + 1
                ));
            };
            if segments.iter().any(|segment| !is_valid_path_segment(segment)) {
                return Err(format!(
                    "{kind} rule {} parameter {} has an invalid path.",
                    rule_index + 1,
                    param_index + 1
                ));
            }
            if !payload_value_matches_type(param.value_type, &param.value) {
                return Err(format!(
                    "{kind} rule {} parameter {} value does not match declared type.",
                    rule_index + 1,
                    param_index + 1
                ));
            }
        }
    }
    Ok(())
}

fn validate_filter_rule_sets(rule_sets: &[PayloadFilterRuleSet]) -> Result<(), String> {
    for (rule_index, rule_set) in rule_sets.iter().enumerate() {
        if !rule_set
            .models
            .iter()
            .any(|candidate| !candidate.trim().is_empty())
        {
            return Err(format!("filter rule {} requires at least one model.", rule_index + 1));
        }
        if rule_set.paths.is_empty() {
            return Err(format!("filter rule {} requires at least one path.", rule_index + 1));
        }
        for (path_index, path) in rule_set.paths.iter().enumerate() {
            let Some(segments) = split_simple_path(path) else {
                return Err(format!(
                    "filter rule {} path {} is invalid.",
                    rule_index + 1,
                    path_index + 1
                ));
            };
            if segments.iter().any(|segment| !is_valid_path_segment(segment)) {
                return Err(format!(
                    "filter rule {} path {} is invalid.",
                    rule_index + 1,
                    path_index + 1
                ));
            }
        }
    }
    Ok(())
}

fn payload_value_matches_type(value_type: PayloadValueType, value: &Value) -> bool {
    match value_type {
        PayloadValueType::String => value.is_string(),
        PayloadValueType::Number => value.is_number(),
        PayloadValueType::Boolean => value.is_boolean(),
        PayloadValueType::Json => true,
    }
}

fn remove_path(object: &mut Map<String, Value>, path: &str) -> bool {
    let Some(segments) = split_simple_path(path) else {
        return false;
    };
    remove_segments(object, &segments)
}

fn remove_segments(object: &mut Map<String, Value>, segments: &[&str]) -> bool {
    match segments {
        [] => false,
        [leaf] => object.remove(*leaf).is_some(),
        [head, rest @ ..] => object
            .get_mut(*head)
            .and_then(Value::as_object_mut)
            .is_some_and(|child| remove_segments(child, rest)),
    }
}

fn set_default_path(object: &mut Map<String, Value>, param: &PayloadParamRule) -> bool {
    let Some(segments) = split_simple_path(&param.path) else {
        return false;
    };
    set_path(object, &segments, &param.value, SetMode::Default)
}

fn set_override_path(object: &mut Map<String, Value>, param: &PayloadParamRule) -> bool {
    let Some(segments) = split_simple_path(&param.path) else {
        return false;
    };
    set_path(object, &segments, &param.value, SetMode::Override)
}

#[derive(Clone, Copy)]
enum SetMode {
    Default,
    Override,
}

fn set_path(object: &mut Map<String, Value>, segments: &[&str], value: &Value, mode: SetMode) -> bool {
    let Some((leaf, parents)) = segments.split_last() else {
        return false;
    };

    let mut current = object;
    for segment in parents {
        match current.entry((*segment).to_string()) {
            Entry::Vacant(entry) => {
                current = entry.insert(Value::Object(Map::new())).as_object_mut().expect("object");
            }
            Entry::Occupied(mut entry) => {
                if !entry.get().is_object() {
                    match mode {
                        SetMode::Default => return false,
                        SetMode::Override => {
                            entry.insert(Value::Object(Map::new()));
                        }
                    }
                }
                current = entry.into_mut().as_object_mut().expect("object");
            }
        }
    }

    match mode {
        SetMode::Default => {
            if current.contains_key(*leaf) {
                return false;
            }
            current.insert((*leaf).to_string(), value.clone());
            true
        }
        SetMode::Override => {
            let next = value.clone();
            current.insert((*leaf).to_string(), next) != Some(value.clone())
        }
    }
}

#[cfg(test)]
#[path = "payload_rules.test.rs"]
mod tests;
