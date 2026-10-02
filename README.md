# orcarouter-tools-skills

The OrcaRouter Tools agent skill, published to npm as `@orcarouter/tools-skill`.

The package ships one file, `SKILL.md`. An agent installs the skill by fetching it:

```
set up https://unpkg.com/@orcarouter/tools-skill@<version>/SKILL.md
```

To make the OrcaRouter console show this address instead of the built-in
`<api origin>/.well-known/orca/tools/SKILL.md`, set `TOOLS_SKILL_URL` on the
server to the URL above, pinned to a published version.

## Source

`SKILL.md` is copied from the OrcaRouter O2 repo,
`controller/assets/skills/orcarouter-tools/SKILL.md` (the copy the server embeds).
Edit it there first, then copy it here so the two stay the same.

## Release

```
npm version patch        # or minor / major
npm publish              # scoped package; publishConfig.access is public
git push --follow-tags
```

Check that `https://unpkg.com/@orcarouter/tools-skill@<version>/SKILL.md` returns the
file, then update `TOOLS_SKILL_URL`.
