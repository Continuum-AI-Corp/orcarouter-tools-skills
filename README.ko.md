<div align="center">

<img src="assets/orcarouter-logo.png" alt="OrcaRouter" width="96" height="96">

# OrcaRouter Tools

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · **한국어** · [Español](README.es.md)

**API 키 하나로 1,400개 이상의 데이터 도구를 AI 에이전트가 직접 찾고, 비교하고, 실행합니다. 비용은 호출할 때마다 냅니다.**

웹 검색, 소셜 미디어, 기업·인물 데이터, 이메일 찾기, SEO, 금융 시장 등 15개 제공업체의 도구를 제공합니다.
에이전트가 도구를 고르고 실행하며, 사용한 만큼만 과금됩니다.

[![npm: tools-skill](https://img.shields.io/npm/v/@orcarouter/tools-skill?label=%40orcarouter%2Ftools-skill&color=2563eb)](https://www.npmjs.com/package/@orcarouter/tools-skill)
[![npm: cli](https://img.shields.io/npm/v/@orcarouter/cli?label=%40orcarouter%2Fcli&color=2563eb)](https://www.npmjs.com/package/@orcarouter/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-16a34a)](LICENSE)

[웹사이트](https://www.orcarouter.ai) · [문서](https://docs.orcarouter.ai/agent-infra/tools/overview) · [API 키 받기](https://www.orcarouter.ai/register?redirect=/console/token)

**Claude Code** · **Codex** · **Cursor** · **OpenClaw** · **Hermes** · **opencode**, 그리고 skill 파일을 읽을 수 있는 모든 에이전트에서 동작합니다.

</div>

---

## 실제 동작

<a href="assets/people-search.mp4"><img src="assets/people-search-preview.gif" alt="에이전트가 이메일 찾기 도구를 시도했지만 결과가 없자 다음 제공업체로 바꿔 검증된 이메일을 얻는 장면" width="100%"></a>

<p align="center"><a href="assets/people-search.mp4"><b>▶ 60초 데모 보기</b></a> (MP4, 소리 있음)</p>

> 에이전트에게 AI 인프라 스타트업 20곳의 플랫폼 책임자를, 검증된 업무용 이메일과 함께, 3달러 이내로 찾아 달라고 요청합니다.
> 에이전트는 회사를 찾고, 6개 제공업체의 이메일 찾기 도구 13개를 비교하고, 결과가 없으면 다음 제공업체로 넘어가며,
> 한도를 넘는 호출 전에는 소유자에게 한 번 승인을 받습니다.
> 결과: 검증된 이메일 20개, 총 **$1.06**. 구독은 필요 없습니다.
>
> <sub>도구 이름과 가격은 OrcaRouter의 실제 정가입니다. 회사, 인물, 결과는 예시입니다.</sub>

## OrcaRouter Tools를 쓰는 이유

- 🔑 **키 하나, 지갑 하나.** OrcaRouter API 키 하나로 모든 도구를 쓸 수 있고, 모델 호출 비용도 같은 지갑에서 나갑니다.
- 🔎 **업체가 아니라 할 일로 찾기.** "company enrichment"나 "tiktok posts"로 검색하면 맞는 도구가 가격, 7일 성공률, 지연 시간과 함께 순위대로 나옵니다.
- 🔁 **결과가 없으면 대체 도구로.** 같은 일을 하는 도구에는 같은 `route_group`이 붙어 있습니다. 하나가 실패하거나 아무것도 찾지 못하면, 에이전트가 같은 그룹의 다른 도구를 나열하고 직접 다음 도구를 시도합니다.
- 💵 **호출당 과금.** 구독도 계약도 없습니다. 모든 실행은 실행 전에 견적이 나오고, 실패한 호출은 과금되지 않습니다.
- 🛡️ **모든 호출에 내 규칙 적용.** 에이전트마다 예산, 호출당 한도, 승인 기준을 정할 수 있습니다. 한도를 넘으면 에이전트가 먼저 사람에게 승인을 요청합니다.

## 빠른 시작

### 1. API 키 받기

[가입](https://www.orcarouter.ai/register?redirect=/console/token)하거나 [로그인](https://www.orcarouter.ai/login?redirect=/console/token)하면 API 키 페이지로 이동합니다. 새 계정에는 이미 키가 하나 있습니다. 그다음:

```bash
export ORCA_KEY=<내 OrcaRouter API 키>
```

키를 프롬프트에 붙여 넣지 마세요. 이 단계를 건너뛰어도 에이전트가 처음 도구가 필요할 때 안내합니다.

### 2. 에이전트에게 skill 주기

에이전트에게 이렇게 말합니다:

```
set up https://cdn.jsdelivr.net/npm/@orcarouter/tools-skill/SKILL.md
```

또는 Claude Code skill로 설치합니다:

```bash
mkdir -p ~/.claude/skills/orcarouter-tools
curl -fsSL https://cdn.jsdelivr.net/npm/@orcarouter/tools-skill/SKILL.md \
  -o ~/.claude/skills/orcarouter-tools/SKILL.md
```

그다음 필요한 것을 요청하면 됩니다. 예: *"vercel.com의 LinkedIn 페이지, 직원 수, 설립 연도를 찾아 줘. 최대 0.10달러까지만 써"*.

### 3. 또는 CLI 사용

```bash
npm install -g @orcarouter/cli
orca-tools setup -k <YOUR_API_KEY>
orca-tools discover -q "company enrichment"
orca-tools run -t <toolId> -i '{"company_domain":"vercel.com"}'
```

## 동작 방식

에이전트는 세 단계를 따르며, 모두 [`SKILL.md`](SKILL.md)에 설명되어 있습니다.

1. **discover**: 필요한 일로 카탈로그를 검색합니다. 각 결과에는 가격과 상태가 있고, 대체 도구가 있으면 `route_group`도 있습니다.
2. **inspect**: 실행하기 전에 도구의 입력 스키마를 읽습니다.
3. **run**: 견적을 내고, 실행하고, 워크스페이스 지갑에 과금합니다. 응답에는 결과와 실제 비용이 들어 있습니다.

같은 일을 하는 제공업체가 보통 여러 곳이라, 에이전트는 돈을 쓰기 전에 비교할 수 있습니다:

<img src="assets/compare-sources.png" alt="서로 다른 제공업체의 LinkedIn 기업 정보 도구 4개와 각각의 가격, 7일 성공률, 지연 시간" width="100%">

## 카탈로그 구성

소셜 미디어(TikTok, Instagram, YouTube, LinkedIn, X, Reddit, Facebook 등), 검색 엔진과 SEO,
AI 검색 노출, 기업과 인물, 이메일·전화번호 찾기, 웹 스크래핑, 금융 시장 등.

<img src="assets/catalog-companies-people.png" alt="기업과 인물: 기업 검색, 인물 검색, 이메일 찾기와 검증, 전화번호 찾기" width="100%">

각 도구의 가격과 상태를 포함한 실시간 카탈로그는 [OrcaRouter 콘솔](https://www.orcarouter.ai/console)에서 볼 수 있습니다.

## CLI

`orca-tools`는 같은 API를 터미널에서 쓰는 도구로, 에이전트를 위해 만들었습니다. 색상 코드 없는 일반 텍스트를 출력하고, 의존성이 없으며, Node 18 이상에서 동작합니다.

<img src="assets/cli.png" alt="orca-tools로 discover와 run을 실행하고 저장한 결과를 jq로 읽는 화면" width="100%">

```
orca-tools discover -q <query> [-l <limit>] [-c <category>]
orca-tools discover -g <routeGroup>          # 대체 도구 목록
orca-tools inspect  -t <toolId>
orca-tools run      -t <toolId> -i '<json>' [-o out.json]
orca-tools runs list | runs get -r <runId>
orca-tools balance
```

전체 설명은 [`cli/README.md`](cli/README.md)(영문)를 참고하세요.

## 지출 관리

에이전트마다 자체 예산, 호출당 한도, 승인 규칙이 있고, 모든 실행은 입력, 출력, 가격, 지연 시간과 함께 기록됩니다.

<img src="assets/budget-controls.png" alt="에이전트의 월 예산(초과 시 중지)과 청구 내역" width="100%">

실패한 호출은 비용이 들지 않습니다. 실행 기록에 $0.00으로 무효 처리되어 남습니다:

<img src="assets/failed-calls-free.png" alt="실패한 제공업체 호출이 무효 처리되어 $0.00으로 기록된 실행 로그" width="100%">

## 이 저장소의 구성

- **[`SKILL.md`](SKILL.md)**: 에이전트 skill. 도구를 찾고, 확인하고, 실행하는 방법과 오류를 읽고 지출을 관리하는 방법을 설명합니다.
  [`@orcarouter/tools-skill`](https://www.npmjs.com/package/@orcarouter/tools-skill)로 배포됩니다.
- **[`cli/`](cli/)**: 명령줄 클라이언트 `orca-tools`.
  [`@orcarouter/cli`](https://www.npmjs.com/package/@orcarouter/cli)로 배포됩니다.
- **[`assets/`](assets/)**: 이 README에 쓰인 이미지와 데모 영상.

## 링크

- 문서: [docs.orcarouter.ai/agent-infra/tools](https://docs.orcarouter.ai/agent-infra/tools/overview)
- 웹사이트: [orcarouter.ai](https://www.orcarouter.ai)

## 라이선스

[MIT](LICENSE)

---

<sub>이 문서는 [README.md](README.md)의 번역본입니다. 내용은 영문판이 기준입니다.</sub>
