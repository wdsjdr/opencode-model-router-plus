# opencode-model-router-plus

An OpenCode plugin that routes work by cost tier — and by professional capability.

**English** | [简体中文](README.zh-CN.md)

> The English README is authoritative. If the two language versions diverge, this file wins.

Maintained by [wdsjdr](https://github.com/wdsjdr) · Original author: [Marco Jardim](https://github.com/marco-jardim)

Unofficial fork — not affiliated with or endorsed by the original author. Upstream: https://github.com/marco-jardim/opencode-model-router

[![License: GPL-3.0-only](https://img.shields.io/badge/license-GPL--3.0--only-blue.svg)](LICENSE)

## What this fork adds

Upstream routes on a single axis: cost. This fork adds a second axis, capability. The two are
kept apart on purpose — cost tiers stay the default path for ordinary work, and capability
branches are opt-in specialists that the orchestrator names explicitly. Nothing about the
existing cost routing changes if you never configure a branch.

### Professional capability branches

Capability branches are never picked by the automatic cost router; the orchestrator dispatches
them by name when the task calls for their specialty.

| Branch | Capability | Dispatch when | Reply contract | Cap |
|---|---|---|---|---|
| `@animator` | frontend | Frontend motion and rendering — CSS/SVG/Canvas/WebGL/p5/Three.js, complex interaction, visualisation work | Conclusion + list of changed files + self-check evidence (build, screenshot) + open issues | 2 |
| `@eyes` | vision | Images, screenshots, PDF pages, UI reproduction, video frames — when you need to know what is actually on screen and how it differs from the target | Observations item by item with frame/page numbers (only what was really seen) → difference from target → missing information → suggested next step | 3 |
| `@ears` | audio | Audio, speech, video with sound — when you need to understand what was said or heard | Timeline of key points + verbatim quotes with timestamps + unclear or missing parts; says "cannot transcribe" rather than inventing | 2 |

The branch catalogue (trigger, reply contract, per-session cap, fallback) lives in the `branches`
section of `tiers.json` and is rendered into the system prompt by `src/router/branches.ts`. The
bundled `tiers.json` defines the branches inside the `daily` preset only; switching to another
preset drops them unless you add the same section there. Branch model, variant and effort are
ordinary tier settings, so they are changed the same way as any cost tier.

**Capability preflight is mandatory.** If a task involves images, screenshots, PDFs, video or
audio and the orchestrator is a text-only model, it must dispatch the vision or audio branch
first, with absolute paths, before choosing an implementation path. Media content is never
inferred from filenames, dimensions, or the user's description. A video with sound may need both
branches: audio first for what was said, then frames for what was shown.

### Declarative model configuration

Model identities can be named once and reused, and a provider profile can state its own
capabilities instead of relying on the plugin to guess them from a model id string:

```jsonc
{
  // Name a model+variant+effort bundle once...
  "models": {
    "opus": { "model": "anthropic/claude-opus-5-5", "effort": "high" },
    "scan": { "model": "opencode/gemini-3.8-flash" }
  },
  "presets": {
    "daily": {
      // ...then inherit it per tier.
      "heavy": { "use": "opus" },
      "medium": { "use": "scan", "variant": "high" }
    }
  },
  // Per-provider capability profile: which family this is, which wire key
  // carries effort, and the highest level the family accepts.
  "providers": {
    "anthropic": { "family": "anthropic", "effortKnob": "effort", "maxEffort": "max" },
    "my-openai-proxy": { "family": "openai", "effortKnob": "reasoningEffort", "maxEffort": "high" }
  }
}
```

A tier that sets `use` may still override any field on top of the alias. A `null` `effortKnob`
means the provider has no effort knob and the plugin stays quiet about it instead of warning.
`providers` replaces the old provider-family guessing from model id substrings; the legacy
heuristics still run as a warned fallback for providers that have no profile. Aliases and
provider profiles are plain config values, so they can be declared in any layer — bundled,
user overrides, or project.

### Config ergonomics

| Key | Effect |
|---|---|
| `"variant": null` | Clears a variant inherited from a `models` alias or a lower config layer, instead of keeping it. |
| `rules+`, `whenToUse+`, `candidates+`, `overrideRules+`, `capabilities+` | Appends to the inherited array instead of replacing it. Without the `+`, arrays are replaced wholesale. |

## Requirements

- **Node >= 22.**
- **OpenCode host >= 2.0.20** — this fork targets the v2 plugin path.
- For `scripts/transcribe.py`: **ffmpeg** on `PATH`. `faster-whisper` is optional; without it the
  script exits with code 2 and asks for the install instead of pretending it transcribed anything.

## Install

There is no build step: OpenCode loads `server.ts` from the checkout root, and `npm install`
only pulls the development dependencies used for type checking.

```bash
git clone https://github.com/wdsjdr/opencode-model-router-plus.git
cd opencode-model-router-plus
npm install
```

Then point the host at the checkout. In `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "plugins": ["/absolute/path/to/opencode-model-router-plus"]
}
```

Restart the host. `plugins` is read at startup, so a running session will not pick up the change
until you start a new one.

## Quick start

1. Install and register the plugin as above.
2. Restart OpenCode, then start a fresh session.
3. Ask for something that needs several models — for example: "fix the failing test in this repo".
   The orchestrator routes it to a cost tier; if the task needs a frontend, vision or audio
   specialist, it dispatches the matching branch instead.

Verify the registration:

```bash
opencode-cli debug agents --standalone
```

The output should list `animator`, `eyes` and `ears` alongside the cost tiers (`fast`, `medium`,
`heavy`). If the branches are missing, the host is still running the previous `plugins` list —
restart it and open a new session.

## Configuration

Tiers, branches, model aliases, provider profiles and routing behaviour are all configured in
JSON/JSONC. The full reference is in [docs/CONFIG.md](docs/CONFIG.md), and
[`schema/opencode-model-router.schema.json`](schema/opencode-model-router.schema.json) can be
wired into your editor for completion and validation.

Configuration layers, later ones winning:

1. the bundled `tiers.json`;
2. `~/.config/opencode/opencode-model-router.overrides.jsonc`;
3. `.opencode/opencode-model-router.overrides.jsonc` in the project.

Arrays are replaced by a later layer unless the key ends in `+`, in which case they are appended.
`examples/` contains sanitized templates you can copy: model names are placeholders, and nothing
in them points at a private host or account.

## Branches

Capability branches, their permissions and their limits are documented in
[docs/BRANCHES.md](docs/BRANCHES.md). The short version: `@animator` may write and run builds but
may not forward to subagents; `@eyes` is read-only; `@ears` is read-only plus a shell allowlist
limited to `ffmpeg`, `ffprobe` and `scripts/transcribe.py`.

## Upstream

This fork keeps the upstream routing engine, the cost tiers, the verification pipeline and the
TUI. What upstream does, upstream documents:

- [Upstream README (v2.8.0, preserved verbatim)](docs/UPSTREAM-README-v2.8.0.md)
- https://github.com/marco-jardim/opencode-model-router

Report fork-specific bugs (capability branches, aliases, provider profiles, the fork's
documentation) to the [fork's issue tracker](https://github.com/wdsjdr/opencode-model-router-plus/issues).
Issues that reproduce on unmodified upstream belong upstream, where the original author can act
on them.

## License

GPL-3.0-only. The upstream `LICENSE` is retained unmodified, and the whole repository remains
GPL-3.0-only. See [NOTICE](NOTICE) for provenance and the list of modifications in this fork.