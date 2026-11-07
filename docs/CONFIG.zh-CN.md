[English](CONFIG.md) | **简体中文**

# 配置参考

`tiers.json` 随插件发布，不要直接改它。你的改动写在 overrides 文件里，由深合并叠加其上。本页记录合并规则，以及让路由器可移植的三类声明：`models` 别名、`providers` 能力档、`branches`（见 [BRANCHES.zh-CN.md](BRANCHES.zh-CN.md)）。

## 1. 合并模型

三层，优先级由低到高：

1. 插件内置的 `tiers.json`（格式的准绳）；
2. `~/.config/opencode/opencode-model-router.overrides.jsonc`（用户级）；
3. `<project>/.opencode/opencode-model-router.overrides.jsonc`（仅当前仓库）。

对象递归合并；标量与数组整体替换；未知的顶层键被忽略，所以 override 文件可以写自己的注释性字段（`"$schema"`、`"//"` 等）而不影响加载。

解析失败的 override 文件会被跳过并打印警告——它不会让启动失败——但也完全不生效，所以第一次用的时候留意日志。

## 2. `key+` 追加

以 `+` 结尾的键在**两侧都是数组**时做拼接而不是替换，值存到去掉 `+` 的那个键下：

| 追加键 | 追加到 |
|---|---|
| `rules+` | `rules` |
| `whenToUse+` | 某个档位的 `whenToUse` |
| `candidates+` | 回退候选列表 |
| `overrideRules+` | 某个模式的 `overrideRules` |
| `capabilities+` | 别名或档位的 `capabilities` |

这条规则写在合并循环里而不是键名表里，所以在任意层级都生效：`presets.daily.medium.whenToUse+` 只追加到那一个档位的列表。

不加 `+` 就必须把出厂数组整份抄一遍：

```jsonc
// 出厂 rules 有 11 条，你得全部重写一遍
{ "rules": ["我的第一条", "我的第二条"] }   // ← 11 条全丢
```

```jsonc
// 保留 11 条，再加两条
{ "rules+": ["我的第一条", "我的第二条"] }
```

当基础层没有这个键、或它不是数组时，override 的值直接替换（同样存到去掉 `+` 的键下），所以第一层可以用 `rules+` 引入这个键，后面的层继续往上追加。

## 3. `models` 别名注册表

一组命名的 `model` + 调参，档位用 `"use": "<alias>"` 引用。

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `model` | 是 | string | `provider/model`，与档位上的写法一致。 |
| `variant` | 否 | string \| null | 非空，不含空白，不含 `#`。写 `null` 等于不写（显式不继承任何 variant）。 |
| `effort` | 否 | `low` \| `medium` \| `high` \| `xhigh` \| `max` | 通过 provider 的开关下发（第 4 节）。 |
| `thinking` | 否 | object | `budgetTokens`（数字）——Anthropic 风格的显式预算。 |
| `reasoning` | 否 | object | `effort`（`low` \| `medium` \| `high`）与 `summary`（`auto` \| `always` \| `never`）——OpenAI 风格。 |
| `capabilities` | 否 | string[] | 模型会什么：`text`、`vision`、`audio`、`frontend`…… 会与 `branches` 做一致性校验（见 BRANCHES.zh-CN.md）。 |

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

引用别名的档位可以显式覆盖任何别名字段；档位上的显式字段优先。这正是别名的意义：公共部分写一次，逐档差异留在本地。

别名会在校验之前对每个预设解析完毕，所以下游——回退阶梯、`/tiers`、子代理注册——只会看到普通档位。

## 4. `providers` 能力档

键可以是 provider id（`provider/model` 中第一个 `/` 之前的部分）、provider 加模型前缀（`opencode-go/kimi-`），或完整的模型引用（`opencode-go/kimi-k2.7-code`）。能力档说明这个 provider——或它背后某一类模型——希望怎样表达 effort。

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `family` | 是 | `anthropic` \| `openai` \| `google` \| `other` | 决定默认值与报文格式。 |
| `effortKnob` | 是 | `effort` \| `reasoningEffort` \| `null` | 档位的 `effort` 发给哪个键。`null` 表示没有这个开关。 |
| `maxEffort` | 否 | effort 档位或 `null` | 封顶请求的档位；缺省为 anthropic→`max`、openai→`high`、google/other→`null`（不封顶）。 |

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

对档位的完整模型引用（`providerId/modelId`，例如 `opencode-go/kimi-k2.7-code`）按“先匹配者胜出”的顺序解析：

1. 键等于完整引用（`opencode-go/kimi-k2.7-code`）；
2. 键包含 `/` 且完整引用以它开头，取其中**最长**的键（`opencode-go/kimi-` 会命中；若同时存在 `opencode-go/kimi-` 与 `opencode-go/kimi-k3.1-pro`，更长者胜出）；
3. 键等于 provider id（`opencode-go`）；
4. 旧的按模型 id 猜测的启发式规则。

四者都不命中的模型退回启发式规则，路由器会警告一次并点名那个具体的模型引用，提示你补一份能力档来显式消掉这条警告。

- `effortKnob: null` 表示*有意忽略*：effort 被丢弃且不警告。适用于拒绝未知键的 provider。
- `maxEffort` 会把更高的请求压到上限并每 provider 警告一次，而不是让调用失败。

请求的 effort 按以下顺序解析：

1. 显式 `thinking.budgetTokens`（Anthropic 报文）；
2. 显式 `reasoning.effort`（OpenAI 报文）；
3. 档位的 `effort`，经 `effortKnob` 映射并由 `maxEffort` 封顶。

因此档位可以只写与 provider 无关的 `effort` 而保持可移植；只有需要精确报文值的档位才应写死 `thinking` 或 `reasoning`。

## 5. `variant: null`

`null` 是清除继承来的 variant，而不是把它设成字符串 `"null"`：

```jsonc
{
  "presets": {
    "daily":  { "medium": { "variant": "high" } },
    "budget": { "medium": { "use": "workhorse", "variant": null } }   // 这里不要 variant
  }
}
```

预设按名字合并，所以继承会跨预设泄漏：只要 `daily.medium` 从任何一层拿到了 `variant`，后面想用“同一个档位但不要 variant”的层就没有别的表达方式。`variant: null` 就是那个方式，而且它优先于别名自带的 `variant`——这是档位显式说的。

## 6. 分支

`branches` 条目把一个命名能力（`frontend`、`vision`、`audio`……）绑定到某个预设档位，并带上触发条件、回复契约与每轮上限。校验对两件会悄悄破坏委派的事很严格：被绑定的档位必须存在于承载分支的预设里；`vision`/`audio` 分支必须指向一个其别名确实声明了该能力的模型。细节与示例见 [BRANCHES.zh-CN.md](BRANCHES.zh-CN.md)。

## 7. 校验错误

加载期错误会点名确切的 JSON 路径，所以改错通常只需一行。

| 报错（节选） | 原因 |
|---|---|
| `'daily.medium.use' is 'nope', which is not a defined alias (defined: animator, eyes, ears)` | `use` 指向了不存在的 `models` 键。 |
| `'models.eyes.model' must be a non-empty string` | 别名没写 `model`，或写成空串。 |
| `'daily.medium.use' must be a non-empty alias name` | `use` 不是字符串。 |
| `'providers.foo.family' must be one of anthropic, openai, google, other` | `family` 拼错或缺失。 |
| `'providers.foo.effortKnob' must be one of effort, reasoningEffort, or null` | `effortKnob` 缺失或非法——provider 没有该开关时要显式写 `null`。 |
| `'branches.eyes.tier' is 'eyes', which is not a tier in any preset (active preset tiers: …)` | 分支绑到了没有任何预设定义的档位。 |
| `'branches.eyes' needs capability 'vision', but tier 'eyes' (alias 'eyes') declares only [text]` | 别名声明了 `capabilities`，但其中没有分支需要的能力。 |
| `'models.eyes.effort' must be one of low, medium, high, xhigh, max (got "ultra")` | 未知的 effort 档位。 |

这里的错误会中止配置加载，这是有意的：一个半生效的路由器比一个看得见的失败更糟。

## 8. 完整示例

一份完整、已脱敏的 override 文件。所有 provider id 都是占位符，换成你真正调用的那些。

```jsonc
{
  // 别名：把模型绑定的公共部分写一次。
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

  // 每个 provider 希望怎样表达 effort。
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
        "description": "@ears 音频听辨",
        "prompt": "You are @ears..."
      }
    },
    "lean": {
      // 同一个别名，但不要 variant：清掉从 `workhorse` 继承来的 "high"。
      "medium": { "use": "workhorse", "variant": null, "costRatio": 4, "steps": 40 }
    }
  },

  // 保留出厂 rules，追加自己的。
  "rules+": [
    "媒体任务先过 @ears，再谈实现",
    "截图是证据，不是装饰"
  ],

  "tierCaps": { "listener": 2 },

  "branches": {
    "ears": {
      "tier": "listener",
      "capability": "audio",
      "trigger": "音频、语音、带声音的视频",
      "returns": "时间轴 + 带时间戳的原话 + 听不清的部分",
      "cap": 2,
      "readOnly": true
    }
  }
}
```