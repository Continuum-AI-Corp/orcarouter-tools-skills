# Releasing (maintainers)

Not shipped in the npm package.

`SKILL.md` is copied from the OrcaRouter O2 repo,
`controller/assets/skills/orcarouter-tools/SKILL.md`. Edit it there first.

```
scripts/sync-from-o2.sh <path-to-O2-checkout>   # commit if SKILL.md changed
npm version patch                               # or minor / major
npm publish
git push --follow-tags
```
