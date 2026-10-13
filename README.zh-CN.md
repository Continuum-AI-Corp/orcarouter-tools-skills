<div align="center">

<img src="assets/orcarouter-logo.png" alt="OrcaRouter" width="96" height="96">

# OrcaRouter Tools

[English](README.md) · **简体中文** · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md)

**一个 API key，1,400+ 个数据工具，你的 AI agent 可以自己发现、比较、调用，按次付费。**

网页搜索、社交媒体、公司与人物数据、邮箱查找、SEO、金融市场等，来自 15 家数据供应商。
agent 自己挑工具、自己调用，只为实际用到的付费。

[![npm: tools-skill](https://img.shields.io/npm/v/@orcarouter/tools-skill?label=%40orcarouter%2Ftools-skill&color=2563eb)](https://www.npmjs.com/package/@orcarouter/tools-skill)
[![npm: cli](https://img.shields.io/npm/v/@orcarouter/cli?label=%40orcarouter%2Fcli&color=2563eb)](https://www.npmjs.com/package/@orcarouter/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-16a34a)](LICENSE)

[官网](https://www.orcarouter.ai) · [文档](https://docs.orcarouter.ai/agent-infra/tools/overview) · [获取 API key](https://www.orcarouter.ai/register?redirect=/console/token)

支持 **Claude Code** · **Codex** · **Cursor** · **OpenClaw** · **Hermes** · **opencode**，以及任何能读取 skill 文件的 agent。

</div>

---

## 看看实际效果

<a href="assets/people-search.mp4"><img src="assets/people-search-preview.gif" alt="agent 先调用一个邮箱查找工具，没有结果，换到下一家供应商，拿到并验证了邮箱" width="100%"></a>

<p align="center"><a href="assets/people-search.mp4"><b>▶ 观看 60 秒演示</b></a>（MP4，有声音）</p>

> 让 agent 找出 20 家 AI 基础设施初创公司的平台负责人，每人附上经过验证的工作邮箱，预算 3 美元以内。
> 它先找到这些公司，再比较 6 家供应商的 13 个邮箱查找工具；一家查不到就换下一家；
> 遇到超出单次限额的调用，先请主人批准一次。
> 结果：20 个已验证邮箱，共 **$1.06**，不需要订阅。
>
> <sub>工具名称和价格是 OrcaRouter 的真实标价；公司、人物和结果为示意数据。</sub>

## 为什么用 OrcaRouter Tools

- 🔑 **一个 key，一个钱包。** 一个 OrcaRouter API key 覆盖所有工具，模型调用也从同一个钱包扣费。
- 🔎 **按需求找工具，而不是按供应商。** 搜 "company enrichment" 或 "tiktok posts"，就能拿到排好序的匹配工具，附带价格、7 天成功率和延迟。
- 🔁 **一个工具没结果，还有替代。** 做同一件事的工具带有相同的 `route_group`。某个工具失败或什么都没找到时，agent 会列出同组的其他工具，自己换下一个试。
- 💵 **按次付费。** 没有订阅、没有合同。每次调用执行前先报价，调用失败不收费。
- 🛡️ **每次调用都按你的规则来。** 可以给每个 agent 设预算、单次限额和审批门槛；超过限额，agent 会先请人批准。

## 快速开始

### 1. 获取 API key

[注册](https://www.orcarouter.ai/register?redirect=/console/token)或[登录](https://www.orcarouter.ai/login?redirect=/console/token)后都会进入 API key 页面，新账号已经自带一个 key。然后：

```bash
export ORCA_KEY=<你的 OrcaRouter API key>
```

不要把 key 粘贴进对话。跳过这一步也没关系，agent 第一次需要调用工具时会引导你完成。

### 2. 把 skill 交给 agent

对 agent 说：

```
set up https://cdn.jsdelivr.net/npm/@orcarouter/tools-skill/SKILL.md
```

或者安装成 Claude Code skill：

```bash
mkdir -p ~/.claude/skills/orcarouter-tools
curl -fsSL https://cdn.jsdelivr.net/npm/@orcarouter/tools-skill/SKILL.md \
  -o ~/.claude/skills/orcarouter-tools/SKILL.md
```

然后直接提需求，例如 *"查一下 vercel.com 的 LinkedIn 主页、员工人数和成立年份，最多花 0.10 美元"*。

### 3. 或者用 CLI

```bash
npm install -g @orcarouter/cli
orca-tools setup -k <YOUR_API_KEY>
orca-tools discover -q "company enrichment"
orca-tools run -t <toolId> -i '{"company_domain":"vercel.com"}'
```

## 工作方式

agent 按三步走，全部写在 [`SKILL.md`](SKILL.md) 里：

1. **discover**：按需求搜索工具目录。每条结果都带价格、健康状况；有替代工具时还带 `route_group`。
2. **inspect**：调用前先读这个工具的输入参数定义。
3. **run**：先报价，再执行，费用记到你的工作区钱包。返回结果里包含输出和实际花费。

同一件事通常有好几家供应商，agent 可以在花钱之前先比较：

<img src="assets/compare-sources.png" alt="四家供应商的 LinkedIn 公司信息工具，各自显示价格、7 天成功率和延迟" width="100%">

## 目录里有什么

社交媒体（TikTok、Instagram、YouTube、LinkedIn、X、Reddit、Facebook 等）、搜索引擎与 SEO、
AI 搜索可见度、公司与人物、邮箱与电话查找、网页抓取、金融市场等。

<img src="assets/catalog-companies-people.png" alt="公司与人物：公司搜索、人物搜索、邮箱查找与验证、电话查找" width="100%">

完整的实时目录（含每个工具的价格和健康状况）在 [OrcaRouter 控制台](https://www.orcarouter.ai/console)。

## CLI

`orca-tools` 就是在终端里用同一套 API，专为 agent 设计：输出纯文本、不带颜色控制符，零依赖，需要 Node 18 或更高版本。

<img src="assets/cli.png" alt="orca-tools 先 discover，再 run，然后用 jq 读取保存的输出" width="100%">

```
orca-tools discover -q <query> [-l <limit>] [-c <category>]
orca-tools discover -g <routeGroup>          # 列出某个工具的替代工具
orca-tools inspect  -t <toolId>
orca-tools run      -t <toolId> -i '<json>' [-o out.json]
orca-tools runs list | runs get -r <runId>
orca-tools balance
```

完整说明见 [`cli/README.md`](cli/README.md)（英文）。

## 花费控制

每个 agent 都有自己的预算、单次限额和审批规则；每次调用都会记录输入、输出、价格和延迟。

<img src="assets/budget-controls.png" alt="一个 agent 的月度预算（超出即停）及其扣费明细" width="100%">

调用失败不花钱，它会出现在调用记录里，金额作废为 $0.00：

<img src="assets/failed-calls-free.png" alt="调用记录中，一次供应商调用失败，被作废并记为 $0.00" width="100%">

## 仓库内容

- **[`SKILL.md`](SKILL.md)**：agent skill，说明如何发现、查看和调用工具，如何理解错误、控制花费。
  发布为 [`@orcarouter/tools-skill`](https://www.npmjs.com/package/@orcarouter/tools-skill)。
- **[`cli/`](cli/)**：命令行客户端 `orca-tools`。
  发布为 [`@orcarouter/cli`](https://www.npmjs.com/package/@orcarouter/cli)。
- **[`assets/`](assets/)**：本 README 用到的图片和演示视频。

## 链接

- 文档：[docs.orcarouter.ai/agent-infra/tools](https://docs.orcarouter.ai/agent-infra/tools/overview)
- 官网：[orcarouter.ai](https://www.orcarouter.ai)

## 许可证

[MIT](LICENSE)

---

<sub>本文是 [README.md](README.md) 的翻译，内容以英文版为准。</sub>
