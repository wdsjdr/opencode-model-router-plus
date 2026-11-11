[English](BRANCHES.md) | **简体中文**

# 专业分支（能力轴）

## 1. 概念

路由器有两条轴。

- **成本档位**（`fast` / `medium` / `heavy`）回答“这件事有多贵”，由任务本身自动选择。
- **分支**回答另一个问题：*有些活是编排者根本做不了的*。纯文本模型看不见截图、听不到录音，也无法可靠地判断一段动画渲染出来的效果——再多思考预算也补不上这个能力缺口。

分支不参与成本自动路由。它们由名字点名派发（`@animator`、`@eyes`、`@ears`），或按声明的触发条件派发。在 `tiers.json` 里，一个分支首先是一个普通的预设档位（因此插件会像注册其他档位一样把它注册成子代理），再加上顶层 `branches` 表中的一条声明，告诉编排者什么时候该用它、什么样的回复才算有效。

## 2. 三个分支

| 分支 | 能力 | 默认绑定 | 权限 | 每轮上限 |
|---|---|---|---|---|
| `@animator` | `frontend` | 高 effort 的强前端模型 | 可读写、可构建与截图、不能转发子代理 | 2 |
| `@eyes` | `vision` | 具备视觉能力的 flash 模型 | 只读 | 3 |
| `@ears` | `audio` | 具备视觉+音频的模型，外加 `ffmpeg` / `ffprobe` | 只读，shell 仅限媒体工具 | 2 |

上表模型即 `presets.daily` 出厂绑定的组合；换成自己的模型见第 5 节。

### `@animator` — `frontend`

- **何时派发：** 前端动效、CSS/SVG/Canvas/WebGL/p5/Three.js 类实现、复杂交互动画、可视化实现。
- **回复契约：** 结论、改动文件清单、真正拿到的自检证据（构建输出、截图路径）、剩余问题。不要交代码作文——只引用对决策有意义的那几行。
- **上限：** 每轮 2 次派发。
- **模型不可用时**（额度耗尽、变体不存在、模型下线）：在一档具备相应能力的 medium 级模型上重试一次，然后把失败原因报回来。不要悄悄用一份“计划”顶替本该做出的成品。

`@animator` 是唯一被要求真正“做东西”的分支：它写页面或组件、渲染、截图、读自己的截图，并反复迭代，直到结果符合目标，或能准确说出哪里不符。

### `@eyes` — `vision`

- **何时派发：** 图片、截图、PDF 页面、UI 复刻、视频抽帧——凡编排者需要知道“画面上到底是什么、和目标差在哪里”的时候。
- **回复契约：** 逐项观察并注明帧号或页码（只写确实看到的）、与目标的差异、缺失信息（“未看到”是有效回答）、建议的下一步。
- **上限：** 每轮 3 次派发。
- **模型不可用时：** 同样是“重试一次再报告”；绝不能用猜测替代观察。

`@eyes` 是刻意只读的：不改文件、不跑构建、也不审查代码风格。它是眼睛，不是评审。

### `@ears` — `audio`

- **何时派发：** 音频、语音或带声音的视频需要逐字转写、定位某句话的时间，或判断声音本身有什么问题时。
- **不要派发：** 已经有可靠文字稿、只需要润色或改写文字，或者问题与声音无关——不要为了凑格式去跑音频分析。
- **回复契约：** 由任务决定形状。转写任务给 `[HH:MM:SS.mmm-HH:MM:SS.mmm] text` 逐行文本（来自 `scripts/transcribe.py`），响度数字绝不能替代文字；审计任务给发现、实际跑过的命令与数值、按严重度排序且带时间范围和听感的问题，以及缺失部分。绝不编造语音或说话人。
- **上限：** 每轮 2 次派发。
- **模型或转写链路不可用时：** 用一行说明，然后用 `ffmpeg silencedetect` 给出语音区间；`ffprobe` 可以证明流规格，但响度报告绝不是转写的替代品。

## 3. 能力前置检查（强制）

只有在以下情况才先用绝对路径派发视觉/音频分支：（a）你是纯文本模型；（b）任务需要逐帧视频分析，或你自己无法定论的密集视觉比对。你自己已经能看图或听音频时，先自己检查，只为真正超出你能力的分析派发。

媒体分支用于你无法自行解决的内容：复杂图片、截图对比、PDF 版面、UI 复刻、逐帧视频，或需要带时间戳转写的语音。只有一张你能看懂的截图、颜色/文字/位置这类简单问题、代码风格审查——不要派发。

绝不要从文件名、尺寸、元数据字段或用户的描述去推断媒体内容。“文件叫 `final-v2.png`，所以布局应该没问题”不是观察。只要配置了 `vision` 或 `audio` 分支，路由器会自动把这条规则注入委派协议。

## 4. 回复契约具有约束力

`returns` 字段不是建议性文案，它定义了什么算合格回答：

- **媒体分支**必须说明看到了什么（带帧号/页码）、与目标差什么、缺什么。“未看到”是正确答案，听起来合理的猜测不是。
- **实现分支**必须自检，并返回结论、改动文件、剩余问题——不是代码作文，也不是计划。

不符合契约的回复就是一次失败的派发，无论它听起来多自信。

## 5. 配置

一个分支在 `tiers.json` 里出现在两处。

```jsonc
{
  "models": {
    "eyes": {
      "model": "google/gemini-3.7-flash",   // 任何你真能调用的 provider/model
      "capabilities": ["text", "vision"]     // 可选；写了才会做下面的能力校验
    }
  },
  "presets": {
    "daily": {
      "eyes": {
        "use": "eyes",          // 复用别名，不必重复写 model/variant/effort
        "readOnly": true,
        "costRatio": 2,
        "steps": 30,
        "description": "@eyes 视觉观察（只读）",
        "prompt": "You are @eyes, a visual observer...",
        "whenToUse": ["截图", "PDF 页面", "UI 复刻"]
      }
    }
  },
  "tierCaps": { "eyes": 3 },
  "branches": {
    "eyes": {
      "tier": "eyes",
      "capability": "vision",
      "trigger": "图片、截图、PDF 页面、UI 复刻、视频抽帧",
      "returns": "观察（带帧号/页码）+ 与目标的差异 + 缺失信息",
      "cap": 3,
      "readOnly": true
    }
  }
}
```

`branches.<name>` 的键：

| 键 | 必填 | 含义 |
|---|---|---|
| `tier` | 是 | **当前**预设中承载该分支的档位名。必须存在，否则加载失败。 |
| `capability` | 是 | 分支提供的能力：`frontend`、`vision`、`audio`，或你自创的名字（`ocr`、`pdf`……）。只有 `vision` 和 `audio` 会触发强制前置检查。 |
| `trigger` | 否 | 编排者何时必须派发到这里。原文渲染进系统提示。 |
| `avoid` | 否 | 何时**不该**派发——即使能力匹配（例如编排者自己已经能看图）。渲染为「do NOT dispatch when: …」。 |
| `returns` | 否 | 回复契约：写字符串则单行渲染；写数组则渲染成有序清单（多段式审计用数组，避免某一段被折叠掉）。 |
| `cap` | 否 | 每轮派发上限。提示中默认不设上限；出厂预设同时写进了 `tierCaps`。 |
| `readOnly` | 否 | 给编排者看的说明；真正的限制在宿主机侧执行（第 6 节）。 |
| `fallback` | 否 | 绑定模型不可用时，先尝试一次的对象。 |

被绑定的档位必须存在于**一个正在承载分支的预设**里。如果 `branches.eyes.tier` 写的是 `eyes`，而当前预设里没有 `eyes` 档位，配置会拒绝加载：

```
tiers.json: 'daily.eyes.use' is 'eyes', which is not a defined alias (defined: animator, eyes, ears)
```

能力校验是在“你声明的能力”和“别名声称的能力”之间做一致性检查。它只在别名声明了 `capabilities` 时触发——未知不等于错误：

```jsonc
// models.eyes.capabilities = ["text"]  →  branches.eyes.capability = "vision"
```

```
tiers.json: 'branches.eyes' needs capability 'vision', but tier 'eyes' (alias 'eyes') declares only [text]
```

别名不写 `capabilities`，这项检查就跳过；提示里仍然会列出该分支。

## 6. 宿主机权限

插件告诉编排者*什么时候*用分支；宿主机决定分支*能碰什么*。两者都写在 `~/.config/opencode/opencode.jsonc`。

```jsonc
{
  "agent": {
    // @animator 能构建、能截图，但不能把活再转发给别的代理。
    "animator": {
      "permission": {
        "subagent": "deny",
        "task": "deny",
        "webfetch": "ask",
        "websearch": "ask"
      }
    },
    // @ears 只负责听：不许改文件、不许委派，shell 仅限媒体工具。
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

`@eyes` 不需要任何权限块：它本来就只读，默认读权限已经够用。

## 7. 添加自己的分支

1. **给它一个模型。** 在 `models` 下加别名（或直接在该档位上写 `model`），例如 `models.mypdf = { "model": "anthropic/claude-sonnet-5-5", "capabilities": ["text", "vision"] }`。
2. **加一个预设档位。** 在承载分支的预设里写：`presets.daily.mypdf = { "use": "mypdf", "readOnly": true, "steps": 30, "description": "...", "prompt": "..." }`。档位上的显式字段覆盖别名。
3. **声明分支。** `branches.mypdf = { "tier": "mypdf", "capability": "vision", "trigger": "扫描版 PDF", "returns": "...", "cap": 3, "readOnly": true }`。
4. **设上限。** `tierCaps.mypdf = 3`。

重启客户端。只要 `branches` 非空，分支章节就会自动注入委派协议——不需要另外注册，插件会从预设档位创建子代理。

## 8. 转写辅助脚本

`scripts/transcribe.py` 是 `@ears` 首选的本地 ASR 通道：

```bash
python scripts/transcribe.py <file> --lang zh [--model small] [--device cpu] [--compute-type int8]
```

- 每个语音段输出一行：`[HH:MM:SS.mmm-HH:MM:SS.mmm] text`，带开始和结束，方便把某句话定位到时间轴。
- 需要 `PATH` 上有 `ffmpeg`（用于抽取音轨）。
- 可选依赖：`pip install faster-whisper`。装不上时脚本以退出码 `2` 结束并打印安装提示；此时 `@ears` 必须报告“无法转写”，不得编造转录。
- `--model` 选择 whisper 尺寸（`tiny` … `large-v3`）；默认值在笔记本 CPU 上也能跑。`--device`（`cpu` / `cuda`）与 `--compute-type`（如 `int8`、`float16`）用来在速度和精度之间取舍。