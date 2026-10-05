# Releasing (maintainers)

Not shipped in either npm package.

This repo publishes two packages:

| Package | Directory | Contents |
| --- | --- | --- |
| `@orcarouter/tools-skill` | `/` | `SKILL.md` only |
| `@orcarouter/cli` | `cli/` | the `orca-tools` CLI (`bin/`, `src/`) |

## @orcarouter/tools-skill

`SKILL.md` is copied from the OrcaRouter O2 repo,
`controller/assets/skills/orcarouter-tools/SKILL.md`. Edit it there first.

```
scripts/sync-from-o2.sh <path-to-O2-checkout>   # commit if SKILL.md changed
npm version patch                               # or minor / major
npm publish
git push --follow-tags
```

## @orcarouter/cli

Tags are `cli-v<version>` so they never collide with the skill's `v<version>`.

```
cd cli
npm test                                        # offline, seconds
scripts/remote-e2e.sh                           # against a real OrcaRouter built from origin/main, on the PR box
npm version patch --no-git-tag-version          # or minor / major
git commit -am "cli: release $(node -p 'require("./package.json").version')"
git tag -a "cli-v$(node -p 'require("./package.json").version')" -m "cli release"
npm publish
git push --follow-tags
```

`scripts/remote-e2e.sh` ships OrcaRouter `origin/main` (`git archive`, only
when it moved) and this `cli/` to the PR box (`ORCA_E2E_SSH`, default `pr`;
`/data/cli_e2e`), builds the server there in a golang container, and runs
`scripts/e2e.mjs` there next to the shared `orcarouter-*` containers — a
server run from a laptop would put every SQL statement on a ~240 ms tunnel.
It uses databases of its own: MySQL `cli_e2e` / `cli_e2e_log`, Mongo
`cli_e2e`, Redis db 14 and 15, ports 3120/3121. Only those are dropped and
recreated (`--fresh`, or when main moved). A run takes about a minute after
the first build.
