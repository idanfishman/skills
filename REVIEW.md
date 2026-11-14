# Review instructions

This repository is a public plugin marketplace. Its hooks run in every session where a plugin is on, and its skills and agents shape what Claude does there. Review for a guardrail that fails first, then for context that misleads Claude, then the release, and prose last.

## Passes

1. **Guardrails.** A finding is Important when:
   - a hook allows what its comment or README says it blocks, or blocks what they say it allows.
   - a hook changes behavior and its `_test.sh` has no case for the change.
   - a skill or agent can merge, approve, send or delete something without the owner.
2. **Context.** Load `fishman:context-engineering` and judge each `SKILL.md`, agent prompt and hook output against it. A finding is Important when:
   - two files that load together say different things.
   - a public file holds a name, path or rule from a private repository.
   - the diff cuts a rule from `plugins/fishman-typescript/skills/styleguide/STYLEGUIDE.md`. It is the owner's source of truth, so it is never trimmed.
3. **Release.** A diff that changes a plugin without a new version in every `plugin.json` is Important. A `CHANGELOG.md` entry that lists commits, not what changes for the plugin user, is Important.
4. **Prose.** Prose follows `fishman:no-fluff`.

Everything that is not Important is a nit.

## Cap the nits

At most five nits per review. Give the rest as a count.

## Do not report

- What `scripts/validate.sh` already fails. CI reports it.
- A route around a hook that only a deliberate bypass takes, such as a script, `bash -c` or an env prefix. The hooks stop mistakes, and branch protection stops the rest.
- Wording that is a matter of taste and already meets `fishman:no-fluff`.
