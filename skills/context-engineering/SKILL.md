---
name: context-engineering
description: Write, review or trim context that Claude reads, such as SKILL.md, CLAUDE.md, agent system prompts, tool descriptions, and procedures or docs for agents. Use when you create or edit one of these files, or when asked to rightsize one.
argument-hint: "[file to review, optional]"
---

Shape context that Claude reads to this standard. Newer models infer intent well. Each extra line costs attention and can conflict with other context, so write the least that changes what Claude does. Write the wording to the `fishman:no-fluff` standard.

If I passed a file path, review and rewrite that file. Otherwise apply the standard to the context you write next.

## Judgement, not rules

- Give the goal and the reason, and let Claude decide how. "Match the comment density of the surrounding code" works better than "Never write multi-line comments".
- Keep a hard rule only where a mistake is expensive or can't be undone.
- Before you add a line, check what else Claude sees: the system prompt, CLAUDE.md files, other skills, the user's request. Cut what this file repeats from them. Report a conflict with another file, but change only the file you are writing.

## Leave out

- Anything Claude can find in the repo or the file system: structure, file lists, what the code already says.
- Lists that go stale: skill names, inventories, versions, owners. Point to where the list lives.
- Repetition. Say each thing once, in the place where it applies. Put tool usage in the tool description, not also in the prompt.
- Memories about the user or the project. Auto-memory saves those.

## Interfaces, not examples

When the context describes a tool, script or file format, design the interface instead of explaining it. Use clear parameter names, enums for the allowed values, and the one rule that keeps it correct. Examples limit Claude to what the examples show. Use one only when the format is hard to describe.

## Where it lives

Load context when it is needed, not up front.

- **Agent system prompt:** say what product Claude is in and what it does there.
- **CLAUDE.md:** what the repo is for in one line, the commands, then the gotchas. Move a procedure into a skill and point to it.
- **Skill:** a light guide that holds opinions and practices specific to a person, team or product. When it gets long, split it into files that SKILL.md links, each with one line that says when to read it.
- **Reference:** for a detailed spec, prefer a file in code over prose: a test suite, an HTML mockup, a function to port. For taste, write a rubric that a reviewer agent checks.

## Review a file

1. Read the file and the context that loads with it: CLAUDE.md files, and the skills and files it points to.
2. Rewrite it to this standard. Keep every gotcha and fact that only this file holds.
3. List what you cut, moved or changed, with one line of reason each.

Source: [The new rules of context engineering for Claude 5 generation models](https://claude.dev/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models/), July 2026.
