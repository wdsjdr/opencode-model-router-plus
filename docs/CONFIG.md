**English** | [简体中文](CONFIG.zh-CN.md)

# Configuration reference

`tiers.json` ships with the plugin and is never edited in place. Your changes live in an overrides file that is deep-merged on top of it. This page documents the merge rules and the three declarations that make the router portable: `models` aliases, `providers` capability profiles, and `branches` (see [BRANCHES.md](BRANCHES.md)).

## 1. Merge model

Three layers, lowest priority first:

1. the bundled `tiers.json` (the schema of record);
2. `~/.config/opencode/opencode-model-router.overrides.jsonc` (user-wide);
3. `<project>/.opencode/opencode-model-router.overrides.jsonc` (this repository only).

Objects merge recursively. Scalars and arrays replace wholesale. Unknown top-level keys are ignored, so an override file may carry comments of its own (`"$schema"`, `"//"`, …) without breaking anything.

An override file that fails to parse is skipped with a warning — it can never brick startup — but it also never applies, so watch the log the first time you use one.

## 2. `key+` append

Keys ending in `+` concatenate instead of replacing, when **both** sides are arrays. The value is stored under the key *without* the `+`:

| Append key | Appends to |
|---|---|
| `rules+` | `rules` |
| `whenToUse+` | a tier's `whenToUse` |
| `candidates+` | a fallback candidate list |
| `overrideRules+` | a mode's `overrideRules` |
| `capabilities+` | an alias's or tier's `capabilities` |

The rule lives in the merge loop, not in a key table, so it works at any depth: `presets.daily.medium.whenToUse+` appends to that one tier's list.

Without `+` you must copy the packaged array in full:

```jsonc
// bundled rules: 11 entries you would have to reproduce
{ "rules": ["my first rule", "my second rule"] }   // ← loses all 11
```

```jsonc
// keeps the 11 and adds two
{ "rules+": ["my first rule", "my second rule"] }
```

When the base is missing or is not an array, the override value replaces it (still stored without the `+`), so the first layer may introduce a key with `rules+` and later layers may keep appending to it.

## 3. `models` alias registry

A named bundle of `model` + tuning, referenced from a tier with `"use": "<alias>"`.

| Field | Required | Type | Notes |
|---|---|---|---|
| `model` | yes | string | `provider/model`, as on a tier. |
| `variant` | no | string \| null | Non-empty, no whitespace, no `#`. `null` = no variant (same as omitting it). |
| `effort` | no | `low` \| `medium` \| `high` \| `xhigh` \| `max` | Sent through the provider's knob (section 4). |
| `thinking` | no | object | `budgetTokens` (number) — Anthropic-style explicit budget. |
| `reasoning` | no | object | `effort` (`low` \| `medium` \| `high`) and `summary` (`auto` \| `always` \| `never`) — OpenAI-style. |
| `capabilities` | no | string[] | What the model can do: `text`, `vision`, `audio`, `frontend`, … Checked against `branches` (see BRANCHES.md). |

```jsonc
{
  "models": {
    "workhorse": { "model": "anthropic/claude-sonnet-5-5", "variant": "high", "effort": "high" }
  },
  "presets": {
    "mine": {
      "medium": { "use": "workhorse", "costRatio": 5, "steps": 50 }
    }
  }
}
```

A tier that uses an alias may override any alias field explicitly; explicit tier fields win. That is the point of the alias: the shared part is written once, the per-tier part stays local.

Aliases are resolved for every preset before validation, so downstream — fallback rungs, `/tiers`, subagent registration — only ever sees a plain tier.

## 4. `providers` capability profiles

Keyed by a provider id (the part of `provider/model` before the first `/`), a provider-plus-model-prefix (`opencode-go/kimi-`), or a full model reference (`opencode-go/kimi-k2.7-code`). The profile says how this provider — or just this family of models behind it — wants effort expressed.

| Field | Required | Type | Notes |
|---|---|---|---|
| `family` | yes | `anthropic` \| `openai` \| `google` \| `other` | Shapes defaults and wire format. |
| `effortKnob` | yes | `effort` \| `reasoningEffort` \| `null` | Which wire key receives the tier's `effort`. `null` = no such knob. |
| `maxEffort` | no | effort level or `null` | Caps the requested level; defaults to `max` for anthropic, `high` for openai, `null` (uncapped) for google/other. |

```jsonc
{
  "providers": {
    "anthropic":              { "family": "anthropic", "effortKnob": "effort", "maxEffort": "max" },
    "anthropic/claude-":      { "family": "anthropic", "effortKnob": "effort", "maxEffort": "max" },
    "opencode":               { "family": "google", "effortKnob": null },
    "openai":                 { "family": "openai", "effortKnob": "reasoningEffort", "maxEffort": "high" },
    "github-copilot":         { "family": "anthropic", "effortKnob": "effort", "maxEffort": "max" },
    "google":                 { "family": "google", "effortKnob": null },
    "zai-coding-plan":        { "family": "other", "effortKnob": null },
    "opencode-go/claude-":    { "family": "anthropic", "effortKnob": "effort", "maxEffort": "max" },
    "opencode-go/kimi-":      { "family": "openai", "effortKnob": "reasoningEffort", "maxEffort": "high" },
    "opencode-go/deepseek-":  { "family": "openai", "effortKnob": "reasoningEffort", "maxEffort": "high" },
    "opencode-go/gpt-":       { "family": "openai", "effortKnob": "reasoningEffort", "maxEffort": "high" },
    "opencode-go/grok-":      { "family": "openai", "effortKnob": "reasoningEffort", "maxEffort": "high" },
    "opencode-go/gemini-":    { "family": "google", "effortKnob": null },
    "opencode-go":            { "family": "other", "effortKnob": null }
  }
}
```

Resolution for a tier's full model reference (`providerId/modelId`, e.g. `opencode-go/kimi-k2.7-code`) is first-match-wins:

1. a key equal to the full reference (`opencode-go/kimi-k2.7-code`);
2. the **longest** key that contains `/` and that the full reference starts with (`opencode-go/kimi-` matches; if both `opencode-go/kimi-` and `opencode-go/kimi-k3.1-pro` exist, the longer one wins);
3. a key equal to the provider id (`opencode-go`);
4. the legacy id-based heuristic (matching on the model name).

A model that matches none of these falls back to the heuristic, and the router warns once naming the exact model reference, so you can add a profile and silence it deliberately.

- `effortKnob: null` means *intentionally ignored*: effort is dropped with no warning. Use it for providers that reject unknown keys.
- `maxEffort` clamps a higher request and warns once per provider instead of failing the call.

Requested effort is resolved in this order:

1. an explicit `thinking.budgetTokens` (Anthropic wire format);
2. an explicit `reasoning.effort` (OpenAI wire format);
3. the tier's `effort`, mapped through `effortKnob` and clamped by `maxEffort`.

So a tier may carry a provider-agnostic `effort` and stay portable; only the tiers that need an exact wire value should spell out `thinking` or `reasoning`.

## 5. `variant: null`

`null` clears an inherited variant instead of setting the string `"null"`:

```jsonc
{
  "presets": {
    "daily":  { "medium": { "variant": "high" } },
    "budget": { "medium": { "use": "workhorse", "variant": null } }   // no variant here
  }
}
```

Inheritance leaks across presets because presets merge by name: if `daily.medium` gained a `variant` from any layer, a later layer that wants the same tier *without* a variant has no other way to say so. `variant: null` is that way, and it also beats an alias's own `variant` — the tier said so explicitly.

## 6. Branches

A `branches` entry binds a named capability (`frontend`, `vision`, `audio`, …) to a preset tier, with a trigger, a reply contract and a per-turn cap. Validation is strict on the two things that silently break delegation: the bound tier must exist in a preset that hosts branches, and a `vision`/`audio` branch must point at a model whose alias actually declares that capability. Details and examples: [BRANCHES.md](BRANCHES.md).

## 7. Validation errors

Load-time errors name the exact JSON path, so a typo is a one-line fix instead of a hunt.

| Message (abridged) | Cause |
|---|---|
| `'daily.medium.use' is 'nope', which is not a defined alias (defined: animator, eyes, ears)` | `use` points at a `models` key that does not exist. |
| `'models.eyes.model' must be a non-empty string` | Alias without a `model`, or an empty one. |
| `'daily.medium.use' must be a non-empty alias name` | `use` is not a string. |
| `'providers.foo.family' must be one of anthropic, openai, google, other` | Misspelled or missing `family`. |
| `'providers.foo.effortKnob' must be one of effort, reasoningEffort, or null` | `effortKnob` absent or invalid — write `null` explicitly if the provider has no knob. |
| `'branches.eyes.tier' is 'eyes', which is not a tier in any preset (active preset tiers: …)` | Branch bound to a tier no preset defines. |
| `'branches.eyes' needs capability 'vision', but tier 'eyes' (alias 'eyes') declares only [text]` | Alias declares `capabilities` without the branch's capability. |
| `'models.eyes.effort' must be one of low, medium, high, xhigh, max (got "ultra")` | Unknown effort level. |

Errors thrown here abort config load on purpose: a half-applied router is worse than a visible failure.

## 8. Full example

A complete, sanitized override file. Every provider id is a placeholder; replace them with the ones you actually call.

```jsonc
{
  // Aliases: the shared part of a model binding, written once.
  "models": {
    "workhorse": {
      "model": "anthropic/claude-sonnet-5-5",
      "variant": "high",
      "effort": "high",
      "capabilities": ["text", "vision"]
    },
    "scout": { "model": "openai/gpt-6-luna-fast", "capabilities": ["text"] },
    "listener": { "model": "google/gemini-3.7-flash", "capabilities": ["text", "vision", "audio"] }
  },

  // How each provider wants effort expressed.
  "providers": {
    "anthropic": { "family": "anthropic", "effortKnob": "effort", "maxEffort": "max" },
    "openai": { "family": "openai", "effortKnob": "reasoningEffort", "maxEffort": "high" },
    "google": { "family": "google", "effortKnob": null }
  },

  "activePreset": "mine",
  "defaultTier": "medium",

  "presets": {
    "mine": {
      "fast": { "use": "scout", "readOnly": true, "costRatio": 1, "steps": 30 },
      "medium": { "use": "workhorse", "costRatio": 5, "steps": 50 },
      "heavy": {
        "use": "workhorse",
        "variant": "max",
        "effort": "max",
        "costRatio": 12,
        "steps": 120
      },
      "listener": {
        "use": "listener",
        "readOnly": true,
        "costRatio": 2,
        "steps": 30,
        "description": "@ears audio inspector",
        "prompt": "You are @ears..."
      }
    },
    "lean": {
      // Same alias, no variant: clears the "high" inherited from `workhorse`.
      "medium": { "use": "workhorse", "variant": null, "costRatio": 4, "steps": 40 }
    }
  },

  // Keep the packaged rules, add your own.
  "rules+": [
    "media tasks go through @ears before any implementation work",
    "screenshots are evidence, not decoration"
  ],

  "tierCaps": { "listener": 2 },

  "branches": {
    "ears": {
      "tier": "listener",
      "capability": "audio",
      "trigger": "audio, speech, videos with sound",
      "returns": "timeline + verbatim quotes with timestamps + unintelligible parts",
      "cap": 2,
      "readOnly": true
    }
  }
}
```