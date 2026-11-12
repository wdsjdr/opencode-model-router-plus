# opencode-model-router-plus

按成本档位、也按专业能力分派任务的 OpenCode 插件。

[English](README.md) | **简体中文**

> 英文版为准。若两种语言的内容出现分歧，以 [README.md](README.md) 为准。

维护者 [wdsjdr](https://github.com/wdsjdr) · 原作者 [Marco Jardim](https://github.com/marco-jardim)

本仓库是非官方 fork，与原作者无隶属关系，也不获其背书。上游：https://github.com/marco-jardim/opencode-model-router

[![License: GPL-3.0-only](https://img.shields.io/badge/license-GPL--3.0--only-blue.svg)](LICENSE)

## 本 fork 增加了什么

上游只有一条轴：成本。这个 fork 加了第二条轴——能力。两者刻意分开：日常任务仍走成本档位，
能力分支是有专长时才由编排方点名派发的可选项。不配置任何分支时，原有的成本路由行为不变。

### 专业能力分支

能力分支不参与成本的自动路由，只有编排方在任务需要该专长时按名字点名派发。

| 分支 | 能力 | 何时派发 | 回报格式 | 每轮上限 |
|---|---|---|---|---|
| `@animator` | 前端 | 前端动效与渲染——CSS/SVG/Canvas/WebGL/p5/Three.js、复杂交互、可视化实现 | 结论 + 改动文件清单 + 自检证据（构建/截图）+ 剩余问题 | 2 |
| `@eyes` | 视觉 | 图片、截图、PDF 页面、UI 复刻、视频抽帧——需要知道画面上到底是什么、与目标差在哪里时 | 逐项观察（注明帧号/页码，只写确实看到的）→ 与目标的差异 → 缺失信息 → 建议下一步 | 3 |
| `@ears` | 音频 | 音频、语音、带声音的视频——需要听懂说了什么、判断听感如何时 | 通过 `router_listen` 直接听（整段或切片），按问题回答：听到的原话，或具体的听感与修改建议；必要时给出时间位置；不编造语音或听感 | 2 |

分支清单（触发条件、回报格式、每轮上限、回退方案）写在 `tiers.json` 的 `branches` 段，
由 `src/router/branches.ts` 渲染进系统提示。内置 `tiers.json` 只在 `daily` 预设下定义分支，
切到其他预设时分支会消失，除非在对应预设里再写一份。分支的模型、variant、effort 都是普通
档位字段，改法和其他成本档位一致。

**能力预检。** 任务需要编排方自身不具备的能力，或复杂视觉分析确实需要专门帮助时，才派发视觉
或音频分支。编排方自己已经能看图或听音频时，直接自行检查。绝不能从文件名、尺寸或用户的描述
去推断媒体内容。带声音的视频可能需要两个分支：先由音频分支听清说了什么，再由视觉分支看画面。

### 声明式模型配置

模型身份可以只写一次然后复用，provider 也可以自己声明能力，而不必让插件从模型 id 字符串去猜：

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
  // carries effort, and the highest level the family accepts. Key 可以是
  // provider id、`provider/模型前缀` 或完整模型引用 —— 同一个网关下多种
  // 原生 API 可以按家族拆开配。
  "providers": {
    "anthropic":           { "family": "anthropic", "effortKnob": "effort",          "maxEffort": "max"  },
    "my-openai-proxy":     { "family": "openai",    "effortKnob": "reasoningEffort", "maxEffort": "high" },
    "opencode-go/claude-": { "family": "anthropic", "effortKnob": "effort",          "maxEffort": "max"  },
    "opencode-go/kimi-":   { "family": "openai",    "effortKnob": "reasoningEffort", "maxEffort": "high" },
    "opencode-go/gemini-": { "family": "google",    "effortKnob": null                                     }
  }
}
```

用了 `use` 的档位仍可在别名之上覆盖任意字段。`effortKnob: null` 表示该 provider 没有 effort
旋钮，插件对此保持沉默，不再告警。

匹配顺序是「先匹配先赢」：① 键等于完整 `provider/model` 引用；② 键是 `provider/前缀` 且是最长命中；
③ 键等于 provider id；④ 回落到旧的「从模型 id 子串猜家族」，并带一次性告警、点名缺失的 profile。
只要存在 profile，就以声明为准，不再猜。别名和 provider profile 都是普通配置值，可以写在任意一层：
内置、用户覆盖或项目内。

### 配置便利

| 键 | 作用 |
|---|---|
| `"variant": null` | 清除从 `models` 别名或更下层配置继承来的 variant，而不是保留它。写在 `models` 别名上时，任意可选字段的 `null` 都等同于不写。 |
| `rules+`、`whenToUse+`、`candidates+`、`overrideRules+`、`capabilities+` | 在继承的数组后追加，而不是替换。不带 `+` 的数组是整体替换。 |

## 环境要求

- **Node >= 22。**
- **OpenCode 宿主 >= 2.0.20** —— 本 fork 面向 v2 插件路径。
- 使用 `scripts/transcribe.py` 需要 `PATH` 中有 **ffmpeg**；`faster-whisper` 可选，未安装时
  脚本以退出码 2 结束并提示安装，而不是假装转写成功。

## 安装

没有构建步骤：OpenCode 直接从仓库根目录加载 `server.ts`，`npm install` 只安装类型检查用的
开发依赖。

```bash
git clone https://github.com/wdsjdr/opencode-model-router-plus.git
cd opencode-model-router-plus
npm install
```

然后在 `~/.config/opencode/opencode.jsonc` 中指向该检出目录：

```jsonc
{
  "plugins": ["/absolute/path/to/opencode-model-router-plus"]
}
```

重启宿主。`plugins` 只在启动时读取，正在运行的会话不会感知变更，需要新开会话。

## 快速开始

1. 按上面的步骤安装并注册插件。
2. 重启 OpenCode，然后新开一个会话。
3. 提一个需要多个模型配合的任务，例如「修好这个仓库里失败的测试」。编排方会按成本档位路由；
   如果任务需要前端、视觉或音频专家，就改为派发对应分支。

确认注册结果：

```bash
opencode-cli debug agents --standalone
```

输出里应当同时出现 `animator`、`eyes`、`ears` 和成本档位（`fast`、`medium`、`heavy`）。如果
分支缺失，通常是宿主还在用旧的 `plugins` 列表——重启并新开会话。

## 配置

档位、分支、模型别名、provider profile 和路由行为都用 JSON/JSONC 配置。完整说明见
[docs/CONFIG.md](docs/CONFIG.md)，也可以在编辑器里挂上
[`schema/opencode-model-router.schema.json`](schema/opencode-model-router.schema.json) 获得补全
与校验。

配置分层，后面的覆盖前面的：

1. 内置的 `tiers.json`；
2. `~/.config/opencode/opencode-model-router.overrides.jsonc`；
3. 项目内的 `.opencode/opencode-model-router.overrides.jsonc`。

除非键名以 `+` 结尾，否则数组会被整体替换；以 `+` 结尾时是追加。`examples/` 里是可复制的
脱敏模板：模型名是占位符，里面不指向任何私有宿主或账号。

### 常见改法

下面这些都写在你的 override 文件里，其它东西不用动。

**换某个档位的模型**

```jsonc
{
  "presets": {
    "daily": { "medium": { "model": "provider/model-id", "variant": "high" } }
  }
}
```

**模型只声明一次，多处复用**

```jsonc
{
  "models": {
    "workhorse": { "model": "provider/model-id", "variant": "high" }
  },
  "presets": {
    "daily": {
      "medium": { "use": "workhorse" },
      "heavy":  { "use": "workhorse", "variant": "max", "steps": 60 }
    }
  }
}
```

档位上显式写的字段优先于别名，所以上面 `heavy` 复用同一个模型，但把 `variant` 和 `steps`
提高了。

**追加规则，而不是替换**

```jsonc
{ "rules+": ["音频类任务先过 @ears 再动手实现"] }
```

**加一个分支**

```jsonc
{
  "models":   { "listener": { "model": "provider/audio-model", "capabilities": ["text", "audio"] } },
  "presets":  { "daily": { "listener": { "use": "listener", "readOnly": true, "steps": 40 } } },
  "branches": {
    "ears": {
      "tier": "listener",
      "capability": "audio",
      "trigger": "音频、语音、带声音的视频",
      "returns": "时间轴 + 带时间戳的原话",
      "cap": 2
    }
  },
  "tierCaps": { "listener": 2 }
}
```

改完重启 OpenCode，再执行 `opencode-cli debug agents --standalone`，确认该出现的 agent 都在。

## 分支

能力分支的权限与限制见 [docs/BRANCHES.md](docs/BRANCHES.md)。简述：`@animator` 可写、可跑
构建，但不能转发子代理；`@eyes` 只读；`@ears` 只读，shell 仅限 `ffmpeg`、`ffprobe` 和
`scripts/transcribe.py`。

## 上游

本 fork 保留上游的路由引擎、成本档位、校验流水线和 TUI。上游自身的行为由上游文档说明：

- [上游 README（v2.8.0，原样保留）](docs/UPSTREAM-README-v2.8.0.md)
- https://github.com/marco-jardim/opencode-model-router

fork 特有的问题（能力分支、别名、provider profile、本 fork 的文档）请报到
[fork 的 issue 跟踪器](https://github.com/wdsjdr/opencode-model-router-plus/issues)。在未改动的
上游上同样能复现的问题请报给上游，原作者才能处理。

## 许可证

GPL-3.0-only。上游 `LICENSE` 原样保留，整个仓库仍为 GPL-3.0-only。来源说明和本 fork 的改动
清单见 [NOTICE](NOTICE)。