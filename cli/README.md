# @orcarouter/cli

`orca-tools` — discover, inspect and run pay-per-call tools (web search,
scraping, data enrichment, and more) through OrcaRouter from a terminal. One
API key, one balance; every run is quoted before it executes and billed to
your workspace wallet.

Node ≥ 18, zero dependencies.

## Install

```
npm install -g @orcarouter/cli
```

## Quick start

Create an API key in the OrcaRouter console, then:

```
orca-tools keys add -l main -k <YOUR_API_KEY>
orca-tools discover -q "company enrichment"
orca-tools inspect -t <toolId>                     # the input schema
orca-tools run -t <toolId> -i '{"domain":"example.com"}'
```

`setup` stores the key and checks it against the server in one step:

```
orca-tools setup -k <YOUR_API_KEY>
```

Self-hosted deployment: add `--base https://<your API host>` to `keys add` or
`setup` once; it is stored with the key. The API host is not the console host.

## Commands

```
orca-tools discover -q <query> [-l <limit>] [-s <minScore>] [-c <category>] [-u]
orca-tools discover -g <routeGroup> [-q <query>] [-u]
orca-tools inspect  -t <toolId>
orca-tools run      -t <toolId> (-i <json> | -f <file>) [-o <outFile>]
                    [--run-ref <ref>] [--approval-id <n>] [--firewall-approval <id>]
orca-tools runs list [--status <s>] [--tool <id>] [--page <n>] [--size <n>]
orca-tools runs get  -r <runId> [-o <outFile>]
orca-tools balance [--run-ref <ref>]
orca-tools meta
orca-tools setup [--base <url>] [-k <key>]
orca-tools keys add -k <key> -l <label> [--base <url>] | keys list | keys activate -l <label> | keys remove -l <label>
```

`discover -g` lists the tools of one route group — a tool's `route_group`, which
`discover` and `inspect` show with how many other tools share it. They are the
alternatives to try when a tool failed or found nothing. The list is in catalog
order, not ranked: you pick the next tool and keep track of what you ran.

`-j` prints raw JSON (on a refusal, the whole error body goes to stderr).

- `run` is synchronous: it returns the finished output and what it cost.
- `--run-ref` names a run budget your operator already declared; an unknown
  ref is refused before anything is held.
- `--approval-id` / `--firewall-approval` are the ids a refusal prints. Pass
  them on the retry of the same run once a human has approved it.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | ok |
| 1 | usage error |
| 2 | refused by the server (bad input, balance, budget, policy, …) — the code is printed first, in brackets |
| 3 | no API key configured |
| 4 | the server could not be reached |

## Configuration

Keys and the base URL live in `~/.orca-tools/config.json` (mode 0600).
`ORCA_TOOLS_KEY` and `ORCA_TOOLS_BASE` override them; `ORCA_TOOLS_HOME` moves
the directory. `keys list` never prints a key, only its last four characters.

## For agents

The agent skill that documents the same API is `@orcarouter/tools-skill`.
