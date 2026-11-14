# The AI-native SDLC playbook: summary

Source: [The AI-native SDLC playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook), Louis Claxton, Anthropic, 21 August 2026. The page links a PDF with the same stages, plays and worked examples.

This is a paraphrased summary, kept as a base for skills about the AI-native SDLC. Check the source before you rely on a detail. The summary of Stage 4 (from continuous evals), Stage 5 and Stage 6 comes from a machine-made extract of the page and is less exact than the rest.

## Thesis

Code generation is no longer the bottleneck. Build runs at agent speed, but planning, review, test and deploy still run at human speed, and their controls assume a human wrote every line. Rebuild the lifecycle around agents. Humans stay accountable for judgement, intent and approval.

## Core idea: a chain of committed artifacts

The linear flow (plan, design, build, test, deploy, maintain) becomes a loop. Each stage commits an artifact that the next stage reads. Git history is the audit trail.

| Stage | Artifact | Change from traditional |
| --- | --- | --- |
| Plan | `intent.md` | Committee requirements become a short file, readable by people and actionable by agents |
| Design | `spec.md` | One agent session, constrained by org skills, replaces analyst spec plus designer hand-off |
| Build | `plan.md`, diff, tests | Generated code, with versioned `CLAUDE.md` and skills as the shared knowledge |
| Test | Eval results | Continuous evals replace QA gates at stage boundaries |
| Deploy | PR with review findings | Layered agent review; humans review regulated or critical code; hooks enforce governance |
| Maintain | Incident record, new `intent.md` | Agents watch production, and a breach writes the next `intent.md` |

Each play in the playbook has the same sections: what changes, getting started (prerequisites, infrastructure), how to execute, governance, and how to measure (leading and lagging indicators). Plays are modular and list their prerequisites.

## Principles

- **Skills advise, hooks enforce, CI and review verify.** A skill is advisory, so a policy that must always hold needs a hook or a PR-time check behind it.
- **The agent may act up to the production gate but cannot pass it.** The agent that wrote the change never approves it. Keep human approval through code-owner branch protection.
- **One source of truth per artifact.** Either the repo, or a legacy system (Jira, ServiceNow) with markdown as working copies and outcomes written back over MCP. The minimum is linkage: each artifact cites the record ID, and each record cites the commit SHA.
- **Give the agent a way to verify its own work** (tests, build, screenshot diff) before a human sees it.

## Stage 1: Plan

- **Capture as `intent.md`.** The originator brainstorms with Claude, which asks analyst-style questions. The output follows an org template (can be a skill) with: problem, proposed outcome, affected users and systems, constraints, open questions. The product owner corrects it, then commits it to a shared home, such as an `intent/` folder in the product repo.
- Measure: time from first conversation to committed `intent.md`; share of intents accepted into design; intent edits after the first `spec.md`.

## Stage 2: Design

- **Requirements and design in one session.** Claude turns an accepted `intent.md` into a `spec.md`, constrained by org skills (brand, security, compliance, UX), and flags concerns, especially where policies contradict. The product owner resolves flags with the policy owners before engineering sees the spec. A human makes the go/no-go call; a tech lead is consulted for riskier work.
- Measure: time from `intent.md` to `spec.md`; `spec.md` edits after the first `plan.md`.

## Stage 3: Build

- **Plan mode by default.** Start read-only with `spec.md`, iterate on a `plan.md` (files, order of work, risks, proof by tests), then commit it. Update it when the work diverges. Stress-test it: what could break, which step is riskiest, what was left out. Bar: someone who never saw the conversation could implement from it.
- **Auto mode** only once guardrails are mature (tuned `CLAUDE.md`, policy skills, blocking hooks, runnable tests), for routine work with a tight spec and small blast radius. Review moves from single edits to artifacts.
- **`CLAUDE.md`.** Run `/init`, trim to what a new joiner needs on day one, keep it under a page: commands, conventions, architecture, things Claude gets wrong. When Claude makes the same mistake twice, the correction goes into the file.
- **Skills as institutional knowledge.** Pick one inconsistently enforced policy, write it as a skill with a trigger in the frontmatter, test that it triggers, and update it when the policy owner changes the policy. Use skills for knowledge that must be applied the same way each time.
- **Hooks as build-time guardrails.** Block edits to protected paths, run formatter and linter after edits, keep credentials out of diffs. Keep them fast and scoped to the changed file. Put heavy checks at commit or PR, and human-approval hooks in Deploy.
- **Parallel sessions and subagents.** One git worktree per independent task; tasks that share files run in sequence. Start with 2 or 3 sessions and add more only while review keeps up. Repeated jobs become subagents with a description and tool limits, for example a simplifier, a verifier (runs the app, reports against `plan.md`, does not fix) and a researcher.
- Measure: repeated mistakes the file should have caught; time to a new joiner's first merged PR; time from policy approval to skill merge; PR findings that cite a policy (should fall); concurrent sessions per engineer while review quality holds; merged changes per engineer with rework rate.

## Stage 4: Test

- **Feedback loop.** Wrap checks in one command that fails on error, and document it with the healthy output in `CLAUDE.md`. For a bug fix, commit a failing test first and block test edits during the fix. For UI, loop on screenshot comparison for two or three rounds. Make "done" include the verification output. Protect tests with a hook.
- **Continuous evals in CI.** Treat evals as the QA gate for the agent setup. Turn 20 to 50 real tasks with accepted outcomes into evals. Run them on a schedule and on any change to `CLAUDE.md`, skills or hooks, and gate those changes on pass rate. Add an eval for every production incident.
- Measure: first-pass CI success of agent changes; eval pass rate over time; review time per PR; change failure rate.

## Stage 5: Deploy

- **AI in the PR loop.** Claude reviews incoming PRs and answers comments on its own. Define review passes (bugs, security, spec and plan compliance) and a cap on nits in a `REVIEW.md`. Tune monthly.
- **Hooks as approval gates.** A hook can allow, ask or block. Each required approval (leadership, change management, compliance) becomes a hook, and a block says how to get the approval.
- **Managed settings for regulated orgs** (a starting point): deny rules for secrets and arbitrary network tools, bypass mode off, managed-only permissions, hooks, MCP servers and plugin marketplace, an OS-level sandbox with a domain allowlist that fails closed, a minimum version.
- **CI/CD.** Claude runs non-interactively for triage, flaky-test summaries and changelogs. Start read-only, then add write steps that only open PRs. Use sandboxed jobs with short-lived scoped tokens and no standing production credentials. Tier autonomy by environment. Rehearse rollback in staging.
- Measure: pipeline failures triaged without paging; wait time per gate; gate violations before and after hooks; DORA metrics; catches before merge against escapes to production.

## Stage 6: Maintain

- **Close the loop.** Detection is deterministic: a script tracks a metric against a rolling baseline. Response tiers live in version-controlled config: at 1 sigma, log only; at 2 sigma, Claude diagnoses read-only; at 3 sigma, Claude may open a PR or run a pre-approved runbook. Diagnoses are written as `intent.md`, and fixes add evals.
- **Recurring codebase scans.** Scheduled security scans with confidence ratings. Bounded patches go through PR review; larger issues become `intent.md`.
- **Claude on call.** An agent in the incident channel diagnoses, verifies recovery over MCP, writes post-mortems to a version-controlled lessons file, and turns tickets into PRs or `intent.md`.
- Measure: time from breach to a triage-ready `intent.md`; share of findings that become merged fixes; repeat incidents of the same class.

## Worked examples in the source

`intent.md` and `plan.md` for a claims-status self-service feature; a payments-service `CLAUDE.md`; a `secure-api-review` skill; a `verifier` subagent; a Stage 2 spec prompt; a release-authorization hook; tiered Stage 6 responses.
