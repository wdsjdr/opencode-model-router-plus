**English** | [简体中文](BRANCHES.zh-CN.md)

# Professional branches (the capability axis)

## 1. Concept

The router has two axes.

- **Cost tiers** (`fast` / `medium` / `heavy`) answer *how expensive is this task*, and are chosen automatically from the task itself.
- **Branches** answer a different question: *what kind of work cannot be done by the orchestrator at all*. A text-only model cannot see a screenshot, hear a recording, or reliably judge a rendered animation — no amount of effort fixes that.

Branches never participate in cost auto-routing. They are dispatched by name (`@animator`, `@eyes`, `@ears`) or by the trigger conditions declared for them. In `tiers.json` a branch is an ordinary preset tier (so the plugin registers it as a subagent like any other tier) plus an entry in the top-level `branches` table that tells the orchestrator when to reach for it and what a valid reply looks like.

## 2. The three branches

| Branch | Capability | Typical binding | Access | Cap |
|---|---|---|---|---|
| `@animator` | `frontend` | a strong frontend model at high effort | read/write, runs builds and screenshots, cannot delegate | 2 / turn |
| `@eyes` | `vision` | a vision-capable flash model | read-only | 3 / turn |
| `@ears` | `audio` | a vision+audio model, plus `ffmpeg` / `ffprobe` | read-only, shell limited to media tooling | 2 / turn |

The models above are the ones shipped in `presets.daily`; bind your own by editing the preset (section 5).

### `@animator` — `frontend`

- **Dispatch when:** frontend animation work, CSS/SVG/Canvas/WebGL/p5/Three.js implementation, complex interaction animation, visualization implementation.
- **Reply contract:** conclusions, the list of changed files, the self-check evidence that was actually obtained (build output, screenshot path), and residual issues. No code essays — quote only the lines that matter to a decision.
- **Cap:** 2 dispatches per turn.
- **When the model is unavailable** (quota exhausted, variant not served, model withdrawn): retry once on a capable mid-tier model, then report what failed. Do not silently return a plan instead of the work.

`@animator` is the one branch that is expected to *build* things: it writes the page or component, renders it, takes a screenshot, reads its own screenshot, and iterates until the result matches the goal or it can name precisely what does not.

### `@eyes` — `vision`

- **Dispatch when:** images, screenshots, PDF pages, UI replication, extracted video frames — whenever the orchestrator needs to know what is actually on screen and how it differs from the goal.
- **Reply contract:** itemized observations with frame or page numbers (only what was actually seen), the differences from the goal, missing information ("not seen" is a valid answer), and a suggested next step.
- **Cap:** 3 dispatches per turn.
- **When the model is unavailable:** the same single retry-then-report rule applies; never substitute a guess for an observation.

`@eyes` is read-only on purpose: it never edits files, never runs builds, and never reviews code style. It is the eyes, not the reviewer.

### `@ears` — `audio`

- **Dispatch when:** audio, speech, or videos with sound need transcription or description.
- **Reply contract:** a timeline of key points, key quotes verbatim with `[HH:MM:SS]` timestamps, and the parts that are unintelligible or missing. If no ASR tool is available, it must say so explicitly — never fabricate speech.
- **Cap:** 2 dispatches per turn.
- **When the model or the transcription stack is unavailable:** report the limitation with whatever `ffprobe` can prove (codecs, duration, channels), and extract frames for `@eyes` when visual context matters.

## 3. Capability preflight (mandatory)

Any task that involves images, screenshots, PDFs, video, or audio must dispatch the vision/audio branch **first**, with absolute paths, before choosing an implementation path.

Never infer media content from a filename, a file dimension, a metadata field, or the user's description. "The file is called `final-v2.png`, so the layout is probably fine" is not an observation. The router injects this rule into the delegation protocol automatically whenever a `vision` or `audio` branch is configured.

## 4. Reply contracts are binding

The `returns` field is not advisory prose. It defines the shape of an acceptable answer:

- A **media branch** must state what it observed (with frame/page numbers), what differs from the goal, and what is missing. "Not seen" is a correct answer; a plausible-sounding guess is not.
- An **implementation branch** must self-verify and return conclusions, changed files, and residual issues — not a code essay and not a plan.

A reply that does not satisfy the contract is a failed dispatch, regardless of how confident it sounds.

## 5. Configuration

A branch lives in two places in `tiers.json`.

```jsonc
{
  "models": {
    "eyes": {
      "model": "google/gemini-3.7-flash",   // any provider/model id you can actually call
      "capabilities": ["text", "vision"]     // optional; enables the capability check below
    }
  },
  "presets": {
    "daily": {
      "eyes": {
        "use": "eyes",          // reuse the alias instead of repeating model/variant/effort
        "readOnly": true,
        "costRatio": 2,
        "steps": 30,
        "description": "@eyes vision observer (read-only)",
        "prompt": "You are @eyes, a visual observer...",
        "whenToUse": ["screenshots", "PDF pages", "UI replication"]
      }
    }
  },
  "tierCaps": { "eyes": 3 },
  "branches": {
    "eyes": {
      "tier": "eyes",
      "capability": "vision",
      "trigger": "images, screenshots, PDF pages, UI replication, video frames",
      "returns": "observations with frame/page numbers + diffs vs goal + missing information",
      "cap": 3,
      "readOnly": true
    }
  }
}
```

`branches.<name>` keys:

| Key | Required | Meaning |
|---|---|---|
| `tier` | yes | Tier key inside the **active** preset that hosts this branch. Must exist, or loading fails. |
| `capability` | yes | What the branch supplies: `frontend`, `vision`, `audio`, or any name you invent (`ocr`, `pdf`, …). Only `vision` and `audio` trigger the mandatory preflight. |
| `trigger` | no | When the orchestrator must dispatch here. Rendered into the system prompt verbatim. |
| `returns` | no | The reply contract: a string rendered inline, or an array rendered as an ordered checklist (use the array form for multi-section audits so no section gets collapsed away). |
| `cap` | no | Per-turn dispatch cap. Defaults to no limit in the prompt; the shipped presets set `tierCaps` as well. |
| `readOnly` | no | Documentation for the orchestrator; enforce it on the host side (section 6). |
| `fallback` | no | What to try once when the bound model is unavailable. |

The bound tier must exist **in a preset that is currently hosting branches**. If `branches.eyes.tier` is `eyes` but the active preset has no `eyes` tier, the config refuses to load:

```
tiers.json: 'daily.eyes.use' is 'eyes', which is not a defined alias (defined: animator, eyes, ears)
```

The capability check is a consistency check between what you promised and what the alias says it can do. It only fires when the alias declares `capabilities` — unknown is not wrong:

```jsonc
// models.eyes.capabilities = ["text"]  →  branches.eyes.capability = "vision"
```

```
tiers.json: 'branches.eyes' needs capability 'vision', but tier 'eyes' (alias 'eyes') declares only [text]
```

Leave `capabilities` off an alias and the check is skipped; the prompt still lists the branch.

## 6. Host-side permissions

The plugin tells the orchestrator *when* to use a branch; the host decides *what the branch may touch*. Both belong in `~/.config/opencode/opencode.jsonc`.

```jsonc
{
  "agent": {
    // @animator builds and screenshots, but must not fan work out to other agents.
    "animator": {
      "permission": {
        "subagent": "deny",
        "task": "deny",
        "webfetch": "ask",
        "websearch": "ask"
      }
    },
    // @ears listens: no edits, no delegation, media tooling only.
    "ears": {
      "permission": {
        "edit": "deny",
        "write": "deny",
        "patch": "deny",
        "subagent": "deny",
        "task": "deny",
        "webfetch": "deny",
        "websearch": "deny",
        "shell": {
          "ffprobe *": "allow",
          "ffmpeg *": "allow",
          "python *transcribe.py*": "allow",
          "*": "ask"
        }
      }
    }
  }
}
```

`@eyes` needs no block at all: it is read-only, and the default read permissions are enough.

## 7. Adding your own branch

1. **Give it a model.** Add an alias under `models` (or write `model` directly on the tier), e.g. `models.mypdf = { "model": "anthropic/claude-sonnet-5-5", "capabilities": ["text", "vision"] }`.
2. **Add a preset tier.** Under the preset that hosts branches: `presets.daily.mypdf = { "use": "mypdf", "readOnly": true, "steps": 30, "description": "...", "prompt": "..." }`. Explicit tier fields override the alias.
3. **Declare the branch.** `branches.mypdf = { "tier": "mypdf", "capability": "vision", "trigger": "scanned PDFs", "returns": "...", "cap": 3, "readOnly": true }`.
4. **Cap it.** `tierCaps.mypdf = 3`.

Restart the client. The branch section is injected into the delegation protocol automatically whenever `branches` is non-empty — there is nothing else to register, and the plugin creates the subagent from the preset tier.

## 8. Transcription helper

`scripts/transcribe.py` is the local ASR path `@ears` prefers:

```bash
python scripts/transcribe.py <file> --lang zh
```

- Requires `ffmpeg` on `PATH` (audio extraction).
- Optional dependency: `pip install faster-whisper`. Without it the script exits with code `2` and prints the install hint; `@ears` must then report that transcription is unavailable rather than inventing a transcript.
- `--model` selects the whisper size (`tiny` … `large-v3`); the default is small enough to run on a laptop CPU.