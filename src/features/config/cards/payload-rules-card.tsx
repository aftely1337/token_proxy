import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createPayloadFilterRule,
  createPayloadParam,
  createPayloadValueRule,
} from "@/features/config/form";
import type {
  PayloadFilterRuleForm,
  PayloadParamForm,
  PayloadRuleValueType,
  PayloadRulesForm,
  PayloadValueRuleForm,
} from "@/features/config/types";
import { m } from "@/paraglide/messages.js";

type PayloadRulesCardProps = {
  value: PayloadRulesForm;
  onChange: (value: PayloadRulesForm) => void;
};

const VALUE_TYPE_OPTIONS: ReadonlyArray<{
  value: PayloadRuleValueType;
  label: () => string;
}> = [
  { value: "string", label: () => m.payload_rules_type_string() },
  { value: "number", label: () => m.payload_rules_type_number() },
  { value: "boolean", label: () => m.payload_rules_type_boolean() },
  { value: "json", label: () => m.payload_rules_type_json() },
] as const;

type RuleSectionProps = {
  kind: "default" | "override";
  title: string;
  description: string;
  rules: PayloadValueRuleForm[];
  onChange: (rules: PayloadValueRuleForm[]) => void;
};

type FilterSectionProps = {
  rules: PayloadFilterRuleForm[];
  onChange: (rules: PayloadFilterRuleForm[]) => void;
};

function getValuePlaceholder(valueType: PayloadRuleValueType) {
  switch (valueType) {
    case "string":
      return m.payload_rules_value_placeholder_string();
    case "number":
      return m.payload_rules_value_placeholder_number();
    case "boolean":
      return m.payload_rules_value_placeholder_boolean();
    case "json":
      return m.payload_rules_value_placeholder_json();
  }
}

function updateArrayItem<T>(items: T[], index: number, nextItem: T) {
  return items.map((item, itemIndex) => (itemIndex === index ? nextItem : item));
}

function removeArrayItem<T>(items: T[], index: number) {
  return items.filter((_, itemIndex) => itemIndex !== index);
}

function RuleSection({ kind, title, description, rules, onChange }: RuleSectionProps) {
  return (
    <div
      className="space-y-4 rounded-lg border border-border/60 p-4"
      data-testid={`payload-rules-${kind}-section`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rules, createPayloadValueRule()])}>
          {m.payload_rules_add_rule()}
        </Button>
      </div>
      {rules.length ? (
        <div className="space-y-4">
          {rules.map((rule, ruleIndex) => (
            <PayloadValueRuleEditor
              key={rule.id}
              kind={kind}
              rule={rule}
              onChange={(nextRule) => onChange(updateArrayItem(rules, ruleIndex, nextRule))}
              onRemove={() => onChange(removeArrayItem(rules, ruleIndex))}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{m.payload_rules_empty()}</p>
      )}
    </div>
  );
}

function FilterSection({ rules, onChange }: FilterSectionProps) {
  return (
    <div
      className="space-y-4 rounded-lg border border-border/60 p-4"
      data-testid="payload-rules-filter-section"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{m.payload_rules_filter_title()}</h3>
          <p className="text-xs text-muted-foreground">{m.payload_rules_filter_desc()}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rules, createPayloadFilterRule()])}>
          {m.payload_rules_add_rule()}
        </Button>
      </div>
      {rules.length ? (
        <div className="space-y-4">
          {rules.map((rule, ruleIndex) => (
            <PayloadFilterRuleEditor
              key={rule.id}
              rule={rule}
              onChange={(nextRule) => onChange(updateArrayItem(rules, ruleIndex, nextRule))}
              onRemove={() => onChange(removeArrayItem(rules, ruleIndex))}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{m.payload_rules_empty()}</p>
      )}
    </div>
  );
}

type PayloadValueRuleEditorProps = {
  kind: "default" | "override";
  rule: PayloadValueRuleForm;
  onChange: (rule: PayloadValueRuleForm) => void;
  onRemove: () => void;
};

function PayloadValueRuleEditor({ kind, rule, onChange, onRemove }: PayloadValueRuleEditorProps) {
  const updateModels = (models: string[]) => onChange({ ...rule, models });
  const updateParams = (params: PayloadParamForm[]) => onChange({ ...rule, params });

  return (
    <div className="space-y-4 rounded-md border border-border/50 bg-background/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">
          {titleCase(kind)} {m.payload_rules_add_rule().replace(/^Add /, "")}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          {m.payload_rules_remove_rule()}
        </Button>
      </div>
      <div className="space-y-2">
        <Label>{m.payload_rules_models_label()}</Label>
        {rule.models.map((model, modelIndex) => (
          <div key={`${rule.id}-model-${modelIndex}`} className="flex gap-2">
            <Input
              aria-label={`${m.field_model()} ${modelIndex + 1}`}
              value={model}
              onChange={(event) =>
                updateModels(updateArrayItem(rule.models, modelIndex, event.target.value))
              }
              placeholder="gpt-5.4"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => updateModels(removeArrayItem(rule.models, modelIndex))}
              disabled={rule.models.length <= 1}
            >
              {m.payload_rules_remove_model()}
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => updateModels([...rule.models, ""])}>
          {m.payload_rules_add_model()}
        </Button>
      </div>
      <div className="space-y-2">
        <Label>{m.payload_rules_params_label()}</Label>
        {rule.params.map((param, paramIndex) => (
          <PayloadParamEditor
            key={param.id}
            param={param}
            index={paramIndex}
            onChange={(nextParam) => updateParams(updateArrayItem(rule.params, paramIndex, nextParam))}
            onRemove={() => updateParams(removeArrayItem(rule.params, paramIndex))}
            disableRemove={rule.params.length <= 1}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => updateParams([...rule.params, createPayloadParam()])}
        >
          {m.payload_rules_add_param()}
        </Button>
      </div>
    </div>
  );
}

type PayloadParamEditorProps = {
  param: PayloadParamForm;
  index: number;
  onChange: (param: PayloadParamForm) => void;
  onRemove: () => void;
  disableRemove: boolean;
};

function PayloadParamEditor({
  param,
  index,
  onChange,
  onRemove,
  disableRemove,
}: PayloadParamEditorProps) {
  return (
    <div className="grid gap-2 rounded-md border border-border/40 p-3 lg:grid-cols-[1.2fr_180px_1.5fr_auto]">
      <Input
        aria-label={`${m.field_path()} ${index + 1}`}
        value={param.path}
        onChange={(event) => onChange({ ...param, path: event.target.value })}
        placeholder="service_tier"
      />
      <Select
        value={param.valueType}
        onValueChange={(value) => onChange({ ...param, valueType: value as PayloadRuleValueType })}
      >
        <SelectTrigger aria-label={`${m.field_type()} ${index + 1}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VALUE_TYPE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        aria-label={`${m.field_value()} ${index + 1}`}
        value={param.value}
        onChange={(event) => onChange({ ...param, value: event.target.value })}
        placeholder={getValuePlaceholder(param.valueType)}
      />
      <Button type="button" variant="ghost" size="sm" onClick={onRemove} disabled={disableRemove}>
        {m.payload_rules_remove_param()}
      </Button>
    </div>
  );
}

type PayloadFilterRuleEditorProps = {
  rule: PayloadFilterRuleForm;
  onChange: (rule: PayloadFilterRuleForm) => void;
  onRemove: () => void;
};

function PayloadFilterRuleEditor({ rule, onChange, onRemove }: PayloadFilterRuleEditorProps) {
  const updateModels = (models: string[]) => onChange({ ...rule, models });
  const updatePaths = (paths: string[]) => onChange({ ...rule, paths });

  return (
    <div className="space-y-4 rounded-md border border-border/50 bg-background/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{m.payload_rules_filter_title()}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          {m.payload_rules_remove_rule()}
        </Button>
      </div>
      <div className="space-y-2">
        <Label>{m.payload_rules_models_label()}</Label>
        {rule.models.map((model, modelIndex) => (
          <div key={`${rule.id}-model-${modelIndex}`} className="flex gap-2">
            <Input
              aria-label={`${m.field_model()} ${modelIndex + 1}`}
              value={model}
              onChange={(event) =>
                updateModels(updateArrayItem(rule.models, modelIndex, event.target.value))
              }
              placeholder="gpt-5.4"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => updateModels(removeArrayItem(rule.models, modelIndex))}
              disabled={rule.models.length <= 1}
            >
              {m.payload_rules_remove_model()}
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => updateModels([...rule.models, ""])}>
          {m.payload_rules_add_model()}
        </Button>
      </div>
      <div className="space-y-2">
        <Label>{m.payload_rules_paths_label()}</Label>
        {rule.paths.map((path, pathIndex) => (
          <div key={`${rule.id}-path-${pathIndex}`} className="flex gap-2">
            <Input
              aria-label={`${m.field_path()} ${pathIndex + 1}`}
              value={path}
              onChange={(event) =>
                updatePaths(updateArrayItem(rule.paths, pathIndex, event.target.value))
              }
              placeholder="reasoning.summary"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => updatePaths(removeArrayItem(rule.paths, pathIndex))}
              disabled={rule.paths.length <= 1}
            >
              {m.payload_rules_remove_path()}
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => updatePaths([...rule.paths, ""])}>
          {m.payload_rules_add_path()}
        </Button>
      </div>
    </div>
  );
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function PayloadRulesCard({ value, onChange }: PayloadRulesCardProps) {
  return (
    <Card data-slot="payload-rules-card">
      <CardHeader>
        <CardTitle>{m.payload_rules_title()}</CardTitle>
        <CardDescription>{m.payload_rules_desc()}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RuleSection
          kind="default"
          title={m.payload_rules_default_title()}
          description={m.payload_rules_default_desc()}
          rules={value.defaultRules}
          onChange={(defaultRules) => onChange({ ...value, defaultRules })}
        />
        <RuleSection
          kind="override"
          title={m.payload_rules_override_title()}
          description={m.payload_rules_override_desc()}
          rules={value.overrideRules}
          onChange={(overrideRules) => onChange({ ...value, overrideRules })}
        />
        <FilterSection
          rules={value.filterRules}
          onChange={(filterRules) => onChange({ ...value, filterRules })}
        />
      </CardContent>
    </Card>
  );
}
