<div align="center">

<img src="assets/orcarouter-logo.png" alt="OrcaRouter" width="96" height="96">

# OrcaRouter Tools

[English](README.md) · [简体中文](README.zh-CN.md) · **日本語** · [한국어](README.ko.md) · [Español](README.es.md)

**API キーひとつで、1,400 以上のデータツールを AI エージェントが自分で探し、比較し、実行できます。料金は呼び出しごとの従量課金です。**

Web 検索、ソーシャルメディア、企業・人物データ、メールアドレス検索、SEO、金融市場などを 15 社のプロバイダーから提供します。
エージェントがツールを選んで実行し、使った分だけ課金されます。

[![npm: tools-skill](https://img.shields.io/npm/v/@orcarouter/tools-skill?label=%40orcarouter%2Ftools-skill&color=2563eb)](https://www.npmjs.com/package/@orcarouter/tools-skill)
[![npm: cli](https://img.shields.io/npm/v/@orcarouter/cli?label=%40orcarouter%2Fcli&color=2563eb)](https://www.npmjs.com/package/@orcarouter/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-16a34a)](LICENSE)

[公式サイト](https://www.orcarouter.ai) · [ドキュメント](https://docs.orcarouter.ai/agent-infra/tools/overview) · [API キーを取得](https://www.orcarouter.ai/register?redirect=/console/token)

**Claude Code** · **Codex** · **Cursor** · **OpenClaw** · **Hermes** · **opencode** のほか、skill ファイルを読めるあらゆるエージェントで使えます。

</div>

---

## 実際の動き

<a href="assets/people-search.mp4"><img src="assets/people-search-preview.gif" alt="エージェントがメール検索ツールを試して結果がなく、次のプロバイダーに切り替えて検証済みのメールアドレスを得る様子" width="100%"></a>

<p align="center"><a href="assets/people-search.mp4"><b>▶ 60 秒のデモを見る</b></a>（MP4、音声付き）</p>

> エージェントへの依頼は「AI インフラ系スタートアップ 20 社のプラットフォーム責任者を、検証済みの仕事用メールアドレス付きで、3 ドル以内で」。
> エージェントは企業を見つけ、6 社・13 個のメール検索ツールを比較し、結果が出なければ次のプロバイダーに切り替え、
> 上限を超える呼び出しの前には一度だけオーナーの承認を求めます。
> 結果：検証済みメールアドレス 20 件で合計 **$1.06**。サブスクリプションは不要です。
>
> <sub>ツール名と価格は OrcaRouter の実際の定価です。企業・人物・結果は説明用のものです。</sub>

## OrcaRouter Tools を選ぶ理由

- 🔑 **キーもウォレットもひとつ。** OrcaRouter の API キーひとつで全ツールを利用でき、モデルの呼び出しも同じウォレットから支払われます。
- 🔎 **ベンダーではなく、やりたいことで探す。** 「company enrichment」や「tiktok posts」で検索すると、該当ツールが価格・7 日間の成功率・レイテンシ付きでランキング表示されます。
- 🔁 **見つからなければ代わりのツールへ。** 同じ仕事をするツールには共通の `route_group` が付いています。失敗したり何も見つからなかったりしたら、エージェントが同じグループの他のツールを一覧し、自分で次を試します。
- 💵 **呼び出しごとの従量課金。** サブスクリプションも契約も不要。実行前に必ず見積もりが出て、失敗した呼び出しには課金されません。
- 🛡️ **すべての呼び出しにあなたのルールを。** エージェントごとに予算、1 回あたりの上限、承認のしきい値を設定できます。上限を超える場合、エージェントはまず人に承認を求めます。

## クイックスタート

### 1. API キーを取得する

[新規登録](https://www.orcarouter.ai/register?redirect=/console/token)または[ログイン](https://www.orcarouter.ai/login?redirect=/console/token)すると API キーのページが開きます。新しいアカウントには最初からキーがあります。続けて：

```bash
export ORCA_KEY=<あなたの OrcaRouter API キー>
```

キーはプロンプトに貼り付けないでください。この手順を飛ばしても、初めてツールが必要になったときにエージェントが案内します。

### 2. エージェントに skill を渡す

エージェントにこう伝えます：

```
set up https://cdn.jsdelivr.net/npm/@orcarouter/tools-skill/SKILL.md
```

または Claude Code の skill としてインストールします：

```bash
mkdir -p ~/.claude/skills/orcarouter-tools
curl -fsSL https://cdn.jsdelivr.net/npm/@orcarouter/tools-skill/SKILL.md \
  -o ~/.claude/skills/orcarouter-tools/SKILL.md
```

あとは必要なことを頼むだけです。例：*「vercel.com の LinkedIn ページ、従業員数、設立年を調べて。使うのは 0.10 ドルまで」*。

### 3. CLI を使う場合

```bash
npm install -g @orcarouter/cli
orca-tools setup -k <YOUR_API_KEY>
orca-tools discover -q "company enrichment"
orca-tools run -t <toolId> -i '{"company_domain":"vercel.com"}'
```

## しくみ

エージェントは 3 つのステップで動きます。すべて [`SKILL.md`](SKILL.md) に書かれています。

1. **discover**：やりたいことでカタログを検索します。各結果には価格と稼働状況、代わりのツールがある場合は `route_group` が付きます。
2. **inspect**：実行前に、そのツールの入力スキーマを確認します。
3. **run**：見積もり、実行、ワークスペースのウォレットへの課金を行います。レスポンスには出力と実際の費用が含まれます。

同じ仕事に複数のプロバイダーがあるのが普通なので、エージェントはお金を使う前に比較できます：

<img src="assets/compare-sources.png" alt="異なるプロバイダーの LinkedIn 企業情報ツール 4 つ。それぞれ価格、7 日間の成功率、レイテンシを表示" width="100%">

## カタログの内容

ソーシャルメディア（TikTok、Instagram、YouTube、LinkedIn、X、Reddit、Facebook など）、検索エンジンと SEO、
AI 検索での露出、企業と人物、メールアドレス・電話番号の検索、Web スクレイピング、金融市場など。

<img src="assets/catalog-companies-people.png" alt="企業と人物：企業検索、人物検索、メールアドレスの検索と検証、電話番号検索" width="100%">

各ツールの価格と稼働状況を含む最新のカタログは [OrcaRouter コンソール](https://www.orcarouter.ai/console)で確認できます。

## CLI

`orca-tools` は同じ API をターミナルから使うためのツールで、エージェント向けに作られています。出力はプレーンテキストでカラーコードを含まず、依存パッケージはゼロ、Node 18 以上で動きます。

<img src="assets/cli.png" alt="orca-tools で discover、run を実行し、保存した出力を jq で読む様子" width="100%">

```
orca-tools discover -q <query> [-l <limit>] [-c <category>]
orca-tools discover -g <routeGroup>          # 代わりのツールを一覧
orca-tools inspect  -t <toolId>
orca-tools run      -t <toolId> -i '<json>' [-o out.json]
orca-tools runs list | runs get -r <runId>
orca-tools balance
```

詳しいリファレンスは [`cli/README.md`](cli/README.md)（英語）を参照してください。

## 支出の管理

エージェントごとに予算、1 回あたりの上限、承認ルールを持ち、すべての実行が入力・出力・価格・レイテンシとともに記録されます。

<img src="assets/budget-controls.png" alt="エージェントの月間予算（上限で停止）と請求明細" width="100%">

失敗した呼び出しは無料です。実行ログには $0.00 で取り消された記録として残ります：

<img src="assets/failed-calls-free.png" alt="プロバイダー呼び出しの失敗が取り消され、$0.00 と記録された実行ログ" width="100%">

## このリポジトリの内容

- **[`SKILL.md`](SKILL.md)**：エージェント用の skill。ツールの探し方・確認・実行、エラーの読み方、支出の管理方法を説明します。
  [`@orcarouter/tools-skill`](https://www.npmjs.com/package/@orcarouter/tools-skill) として公開。
- **[`cli/`](cli/)**：コマンドラインクライアント `orca-tools`。
  [`@orcarouter/cli`](https://www.npmjs.com/package/@orcarouter/cli) として公開。
- **[`assets/`](assets/)**：この README で使っている画像とデモ動画。

## リンク

- ドキュメント：[docs.orcarouter.ai/agent-infra/tools](https://docs.orcarouter.ai/agent-infra/tools/overview)
- 公式サイト：[orcarouter.ai](https://www.orcarouter.ai)

## ライセンス

[MIT](LICENSE)

---

<sub>この文書は [README.md](README.md) の翻訳です。内容は英語版が優先されます。</sub>
