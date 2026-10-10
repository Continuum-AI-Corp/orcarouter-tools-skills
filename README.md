# Agent-tools

An agent skill for discovering, inspecting and running pay-per-call tools
(web search, scraping, data enrichment, and more) through OrcaRouter. One API
key, one balance; every run is quoted before it executes and billed to your
workspace wallet.

## Install

Tell your agent:

```
set up https://cdn.jsdelivr.net/npm/@orcarouter/tools-skill/SKILL.md
```

Or install it as a Claude Code skill:

```
mkdir -p ~/.claude/skills/orcarouter-tools
curl -fsSL https://cdn.jsdelivr.net/npm/@orcarouter/tools-skill/SKILL.md \
  -o ~/.claude/skills/orcarouter-tools/SKILL.md
```

## Setup

You need an OrcaRouter API key. No account yet? Sign up at
<https://www.orcarouter.ai/register?redirect=/console/token> — or sign in at
<https://www.orcarouter.ai/login?redirect=/console/token>. Either one lands on
the API key page (<https://www.orcarouter.ai/console/token>); a new account
already has a key there. Copy it and export it:

```
export ORCA_KEY=<your OrcaRouter API key>
```

The skill reads the key from `ORCA_KEY`. Never paste the key into a prompt.
If you skip this step, the agent walks you through it the first time it needs
a tool.

Full documentation: [docs.orcarouter.ai/agent-infra/tools](https://docs.orcarouter.ai/agent-infra/tools/overview).
