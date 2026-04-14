# Global Payload Rules Design

## Goal

Add a global payload-rules layer to Token Proxy so users can modify outbound JSON request bodies by exact model name without cloning or hand-editing every upstream.

The first version intentionally implements a simplified subset inspired by CLIProxyAPI:

- `default`: write a value only when the target path is missing
- `override`: always write a value
- `filter`: remove a path

## Scope

### In scope

- Global configuration, not per-upstream
- Exact model matching only
- All JSON request types supported by the proxy
- Value types:
  - string
  - number
  - boolean
  - json
- Simplified dotted paths such as:
  - `service_tier`
  - `reasoning.effort`
  - `metadata.foo`
- Visual editing UI in the config screen
- Runtime request-body mutation before forwarding upstream

### Out of scope for v1

- Raw rules
- Wildcards or prefix model matching
- Full JSONPath
- Array indexing / wildcards in paths
- Provider-specific matching
- Non-JSON request bodies

## User-facing behavior

Users can define three global rule groups:

1. **Default rules**
   - Match one or more exact model names
   - Apply only when a path is absent
2. **Override rules**
   - Match one or more exact model names
   - Always set the value
3. **Filter rules**
   - Match one or more exact model names
   - Remove matching paths from the request body

Example intent:

- For `gpt-5.4`, default `instructions` to a fixed system string if absent
- For `gpt-5.4`, override `service_tier` to `priority`
- For `gpt-5.4`, filter out `reasoning.summary`

## Matching model

Rules match against the inbound request model extracted into request metadata.

That means:

- matching uses the user-facing requested model name,
- matching does not depend on provider,
- matching happens before any upstream-specific model mapping changes the actual forwarded model.

## Execution order

Within the global payload-rules layer, execution order is fixed:

1. `filter`
2. `default`
3. `override`

This gives stable semantics:

- remove disallowed fields first,
- then fill missing fields,
- then force the final value when required.

Relative to the existing outbound rewrite pipeline, payload rules should run on the transformed outbound JSON body before provider-specific cleanup steps such as prompt-cache filtering and role rewrites.

## Config shape

Add a new top-level config key:

```json
{
  "payload_rules": {
    "default": [
      {
        "models": ["gpt-5.4"],
        "params": [
          {
            "path": "instructions",
            "value_type": "string",
            "value": "You are an IT software development expert"
          }
        ]
      }
    ],
    "override": [
      {
        "models": ["gpt-5.4"],
        "params": [
          {
            "path": "service_tier",
            "value_type": "string",
            "value": "priority"
          }
        ]
      }
    ],
    "filter": [
      {
        "models": ["gpt-5.4"],
        "paths": ["reasoning.summary"]
      }
    ]
  }
}
```

## Validation rules

### Default / Override

Each rule must have:

- at least one non-empty model
- at least one parameter

Each parameter must have:

- non-empty dotted path
- valid value type
- parseable value for the selected type

Type parsing rules:

- string: keep literal text
- number: parse as JSON number
- boolean: parse `true` or `false`
- json: parse full JSON text into a JSON value

### Filter

Each rule must have:

- at least one non-empty model
- at least one non-empty path

### Simplified path rules

A valid path is a dot-separated list of non-empty object keys.

Valid:

- `service_tier`
- `reasoning.effort`
- `metadata.foo`

Invalid:

- `.foo`
- `foo.`
- `foo..bar`
- `tools[0]`
- `$.foo`

## Runtime mutation semantics

### Filter

- remove the leaf key if the parent object exists
- missing paths are ignored
- non-object intermediates are ignored

### Default

- create missing intermediate objects when needed
- write the leaf only if it does not already exist
- if an intermediate exists but is not an object, skip that param

### Override

- create missing intermediate objects when needed
- replace the leaf value unconditionally
- if an intermediate exists but is not an object, replace it with an object so the override can be written

## UI design

Add a new global config card under **Settings**:

- title: `Payload Rules`
- description: global request-body rules by exact model

The card will contain three sections:

1. Default Rules
2. Override Rules
3. Filter Rules

Each rule is an inline editable block:

- model list (multiple exact-model rows)
- param rows for default / override:
  - path
  - value type select
  - value input
- path rows for filter

The first version does not need fancy drag-and-drop or JSONPath tooling. Clear CRUD controls are enough.

## Backend design

### Config types

Extend both frontend and Rust config types with:

- `payload_rules`
- typed rule entries for default / override / filter

### Runtime application

Introduce a focused helper that:

- checks `meta.original_model`
- reads the transformed outbound request body if it is JSON and <= existing rewrite size limits
- applies filter/default/override in order
- returns a rewritten `ReplayableBody` when changes occur
- otherwise preserves the original body

### Failure policy

- non-JSON bodies: no-op
- oversized bodies: no-op
- invalid config values: blocked at save/build time, not silently accepted at runtime

## Testing

### Frontend

- form round-trips payload rules
- validation rejects empty models / paths / invalid typed values
- payload rules card renders and edits nested rules
- settings page includes the new card

### Backend

- exact model match applies rules
- non-matching model does nothing
- default only fills missing values
- override replaces existing values
- filter removes nested paths
- JSON typed values serialize as real JSON objects/arrays
- invalid or oversized / non-JSON requests are skipped safely

## Risks

### Risk: conflicting with existing model mapping or provider rewrites

Mitigation:

- match on inbound model metadata
- run payload rules on the outbound JSON body before provider-specific cleanup stages
- keep execution order explicit and tested

### Risk: UI becomes too heavy for v1

Mitigation:

- keep the editor row-based and plain
- use exact model strings only
- avoid JSONPath and wildcard complexity

## Recommendation

Implement the feature in two steps on the same branch:

1. backend config + runtime rule engine with unit tests first
2. frontend global settings card + config serialization/validation tests
