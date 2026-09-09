# How an agent gets triggered to work a request

Research for [#5](https://github.com/galmadar/gal-arcade/issues/5), part of the map in
[#1](https://github.com/galmadar/gal-arcade/issues/1).

Every factual claim below carries a URL. Where a source does not answer the question,
this file says so rather than filling the gap. Read on 2026-09-09; agent products move
fast, so treat anything here as a snapshot.

There is no existing `docs/` convention in this repo — it is a `README.md` and an
`index.html`. This file starts one at `docs/research/`.

---

## 1. The constraint that decides everything

The shelf (`gal-arcade`) and the games (`cranes-game`, `rail-yard`) are separate repos.
A request filed as an issue on the shelf has to end as a PR on a game. That kills or
bends most of the obvious options.

All three repos are public and owned by the personal account `galmadar` (verified with
`gh repo view`). Public matters: GitHub Actions minutes are free on public repos.

| Option | Issue trigger | Can open a PR in a *different* repo? |
|---|---|---|
| `anthropics/claude-code-action` | Yes — `@claude`, label, assignee | **No**, not with the built-in auth. Its token is repo-scoped by design |
| Agent CLI in a workflow (Codex action, `jules-invoke`) | Any GitHub event you write | Only if *you* supply a token that reaches the other repo |
| Copilot cloud agent | Yes — assign the issue | **No.** Explicitly documented as impossible |
| Codex cloud | **No** — GitHub *PRs* only | n/a for this shape |
| Jules | Yes — the `jules` label | **Yes**, via the REST API's `source` field |
| Claude Code routines | No issue event (PR/release only) — but yes via API trigger | **Yes**, routines take a list of repositories |
| Cursor Automations | Yes — "Issue label changed" | **Yes** for non-source-control triggers |
| Cross-repo fan-out (`repository_dispatch`) | Yes | **Yes** — this is the generic escape hatch |

---

## 2. Claude Code's GitHub Action (`anthropics/claude-code-action`)

Primary sources: the [product docs](https://code.claude.com/docs/en/github-actions),
the action's [`action.yml`](https://github.com/anthropics/claude-code-action/blob/main/action.yml),
[`docs/security.md`](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md),
[`docs/usage.md`](https://github.com/anthropics/claude-code-action/blob/main/docs/usage.md) and
[`docs/faq.md`](https://github.com/anthropics/claude-code-action/blob/main/docs/faq.md).

### What triggers a run

Two modes, chosen automatically:

> **Interactive mode**: when the workflow provides no `prompt` input, Claude waits for
> the trigger phrase, `@claude` by default, in an issue or pull request comment, in a
> pull request review, or in the body or title of a newly opened issue
>
> **Automation mode**: when the workflow provides a `prompt` input, Claude runs without
> waiting for a mention
> — [github-actions](https://code.claude.com/docs/en/github-actions)

`action.yml` also ships label and assignee triggers:

- `trigger_phrase` — default `"@claude"`
- `label_trigger` — *"The label that triggers the action (e.g. claude)"*, default `"claude"`
- `assignee_trigger` — *"The assignee username that triggers the action (e.g. @claude)"*

([`action.yml` lines 8–18](https://github.com/anthropics/claude-code-action/blob/main/action.yml))

The action's own docs list the default workflow's events as `issue_comment` (created),
`pull_request_review_comment` (created), `issues` (opened, assigned, labeled) and
`pull_request_review` (submitted)
([usage.md](https://github.com/anthropics/claude-code-action/blob/main/docs/usage.md)).

### The gate that matters here

> **Write access**: on issue and pull request events, the triggering user must have
> write access to the repository.
> — [github-actions](https://code.claude.com/docs/en/github-actions)

And from the FAQ:

> Only users with **write permissions** to the repository can trigger Claude. This is a
> security feature to prevent unauthorized use.
> — [faq.md](https://github.com/anthropics/claude-code-action/blob/main/docs/faq.md)

**This bites.** The map settled that players are "known people sent a link". A known
person who is not a repo collaborator has no write access on a public repo, so filing
an issue or commenting `@claude` will *not* start a run. The documented escape is
`allowed_non_write_users`, which the action's own security doc labels:

> **⚠️ Non-Write User Access (RISKY)**: … **This is a significant security risk and
> should only be used for workflows with extremely limited permissions** … Only works
> when `github_token` is provided as input (not with GitHub App authentication)
> — [security.md](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md)

Same doc: when using it, pass `${{ secrets.GITHUB_TOKEN }}` and **not** a PAT, because a
static token "does not rotate between runs and could be partially or fully recovered
over time via prompt injection", and restrict tools with `claude_args`.

There is also a bot gate: *"By default, GitHub Apps and bots cannot trigger this action"*
unless listed in `allowed_bots` (same doc). That is why a "shelf workflow comments
`@claude`" trick fails — see §6.

### Where it runs, and how it authenticates

On GitHub-hosted runners, inside a normal workflow job. Two credentials, separately:

**To Anthropic** — one of `anthropic_api_key`, `claude_code_oauth_token` (a subscription
token from `claude setup-token`, available on Pro, Max, Team and Enterprise), or workload
identity federation via the workflow's OIDC token
([github-actions](https://code.claude.com/docs/en/github-actions)).

**To GitHub** — by default it authenticates as the [Claude GitHub App](https://github.com/apps/claude),
which needs `id-token: write` on the job for the OIDC exchange. The action uses three of the
app's permissions: Contents (r/w), Issues (r/w), Pull requests (r/w). You can override with
a `github_token` input: *"GitHub token with repo and pull request permissions (optional if
using GitHub App)"* ([`action.yml` line 88](https://github.com/anthropics/claude-code-action/blob/main/action.yml)).
The docs' own note on that input is blunter: *"**Only include this if you're connecting a
custom GitHub app of your own!**"*
([usage.md](https://github.com/anthropics/claude-code-action/blob/main/docs/usage.md)).

The example workflow's permission block:

```yaml
permissions:
  contents: write
  pull-requests: write
  issues: write
  id-token: write
  actions: read
```

### It does not open PRs by default

> In its default configuration, **Claude does not create pull requests automatically**
> when responding to `@claude` mentions. Instead: Claude commits code changes to a new
> branch; Claude provides a **link to the GitHub PR creation page** in its response;
> **The user must click the link and create the PR themselves**
> — [security.md](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md)

Branch behaviour on issues: *"Issues: Always creates a new branch with a timestamp"*,
prefix `claude/` by default (`branch_prefix`). Claude *"only creates and pushes commits.
It does not merge branches, rebase, force push"* and *"Never push to branches other than
where it was invoked"* — enforced in the system prompt, so granting `git rebase` via
`--allowedTools` still won't do it ([faq.md](https://github.com/anthropics/claude-code-action/blob/main/docs/faq.md)).

So "agent opens a PR" is not the out-of-the-box behaviour. You get a branch plus a link.
Getting an actual PR means automation mode with a prompt that tells Claude to run
`gh pr create` and the tools to do it. That composition is not documented as a supported
path — **unverified**.

### Cross-repo: no

This is the decisive quote:

> - **Token Permissions**: The GitHub app receives only a short-lived token scoped
>   specifically to the repository it's operating in
> - **No Cross-Repository Access**: Each action invocation is limited to the repository
>   where it was triggered
> - **Limited Scope**: The token cannot access other repositories or perform actions
>   beyond the configured permissions
>
> — [security.md](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md)

An `@claude` on a `gal-arcade` issue cannot produce a branch or PR on `cranes-game`.
Full stop, with the default auth. See §6 for what does work.

### Cost and limits

The docs name the two meters and decline to quantify them:

> **GitHub Actions minutes**: the Claude Code GitHub Action runs on GitHub-hosted
> runners, which consume your GitHub Actions minutes.
> **API tokens**: each interaction consumes tokens based on the length of prompts and
> responses, task complexity, and codebase size. … If you authenticate with an OAuth
> token, runs use your Claude subscription instead of API billing.
> — [github-actions](https://code.claude.com/docs/en/github-actions)

Numbers for those two meters are in §5. The docs' suggested caps: `--max-turns` in
`claude_args`, workflow-level `timeout-minutes`, and GitHub concurrency controls.

---

## 3. Running an agent CLI directly in GitHub Actions

The credential model is the same in every case: the workflow holds a vendor API key as a
repo secret, and separately holds whatever GitHub credential you give it. `GITHUB_TOKEN`
is the default GitHub credential and it is repo-scoped:

> The `GITHUB_TOKEN` … is a GitHub App installation access token. … The token's
> permissions are limited to the repository that contains your workflow.
> — [GITHUB_TOKEN concepts](https://docs.github.com/en/actions/concepts/security/github_token)

Lifetime: up to 6 hours on GitHub-hosted runners; and critically —

> Events triggered by the `GITHUB_TOKEN` will not create a new workflow run
> — [same page](https://docs.github.com/en/actions/concepts/security/github_token)

(with exceptions for `workflow_dispatch` and `repository_dispatch`). That is the rule
behind the Claude FAQ's *"The `github-actions` user cannot trigger subsequent GitHub
Actions workflows."*

### `openai/codex-action`

> Use the Codex GitHub Action (`openai/codex-action@v1`) to run Codex in CI/CD jobs,
> apply patches, or post reviews from a GitHub Actions workflow. The action installs the
> Codex CLI, starts the Responses API proxy when you provide an API key, and runs
> `codex exec` under the permissions you specify.
> — [Codex GitHub Action](https://learn.chatgpt.com/docs/github-action)

Auth to OpenAI: `openai-api-key` from a repo secret. Auth to GitHub: whatever you pass —
the documented sample uses `${{ github.token }}` in a *separate* job just to post a
comment, and checks out with `persist-credentials: false`. Trigger control mirrors
Claude's: *"`allow-users` and `allow-bots` restrict who can trigger the workflow. By
default only users with write access can run the action"*. Privilege controls:
`safety-strategy` (default `drop-sudo`), `unprivileged-user`, `read-only`, `sandbox`.

The doc's own security checklist names the risk this shape carries:

> Sanitize prompt inputs from pull requests, commit messages, or issue bodies to avoid
> prompt injection. Review HTML comments or hidden text before feeding it to Codex.

Cost: OpenAI API billing on your key, plus Actions minutes. The action doc states no
quota of its own.

### `google-labs-code/jules-invoke`

> **This action** lets you trigger Jules from any GitHub event: issues, pull requests,
> schedules, or workflow dispatches.
> — [jules-action README](https://github.com/google-labs-code/jules-action)

Inputs are only `prompt`, `jules_api_key`, `starting_branch`, `include_last_commit`,
`include_commit_log`. Note what is *absent*: no repository/source input. So through the
action, the target repo is implicit — **I could not verify from the README which repo a
`jules-invoke` run works on**, and the README does not say. The REST API does take an
explicit source (§4), so the cross-repo route is the API, not this action.

The README ships an example workflow triggered by *"Issue labeled `bug`"*, and carries
this warning, which is the same problem as §2's write-access gate seen from the other side:

> **⚠️ Important:** Issue-triggered workflows can be exploited by untrusted users opening
> issues. Always restrict who can trigger Jules for sources like GitHub issues.

with a `github.event.issue.user.login` allowlist as the suggested fix. That allowlist is
actually a decent fit for "players are known people".

### `claude-code-base-action`

Lower-level sibling of the Claude action. Worth knowing it exists and what it drops:

> `claude-code-base-action` is a lower-level building block that installs and runs Claude
> Code with the inputs you provide. It does not perform actor permission checks or
> restore project configuration from the base ref.
> — [security.md](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md)

No actor permission checks means no write-access gate — and no protection either.

---

## 4. Hosted / managed agent runners

### GitHub Copilot cloud agent

> You can ask Copilot to start working on an issue by assigning the issue to Copilot.
> — [assign an issue](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/assign-copilot-to-an-issue)

Where it runs, and the repo limit:

> Copilot cloud agent has access to its own ephemeral development environment, powered by
> GitHub Actions, where it can explore your code, make changes, execute automated tests
> and linters and more.
>
> **Copilot can only make changes in the repository specified when you start a task.
> Copilot cannot make changes across multiple repositories in one run.** By default,
> Copilot can only access context in the repository specified when you start a task.
>
> Copilot can only work on one branch at a time and can open exactly one pull request to
> address each task it is assigned.
>
> Each Copilot cloud agent session has a maximum execution time of 59 minutes. This is a
> hard limit that cannot be extended or bypassed.
>
> — [About Copilot cloud agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent)

That first bold sentence disqualifies it for the shelf-issue → game-PR shape. It works
fine if the issue is filed *on the game repo*.

Auth: none to configure — it is GitHub authenticating as itself. Cost:

> Copilot cloud agent uses GitHub Actions minutes and AI credits. The AI credits consumed
> depend on the model used and the number of tokens processed during the session. Within
> your included GitHub Actions minutes and AI credits, you can use Copilot cloud agent
> without incurring additional costs.
> — [same page](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent)

Requires a paid plan: *"Copilot cloud agent is available for all paid Copilot plans."*
Plan prices and credit allowances in §5.

### OpenAI Codex cloud

> Start work in Codex cloud from GitHub pull requests, GitLab merge requests and issues,
> Linear issues, or Slack channels and threads.
> — [Codex cloud](https://learn.chatgpt.com/docs/cloud)

Read that list carefully: GitHub **pull requests**, GitLab merge requests **and issues**,
Linear issues. GitHub issues are not on it. The GitHub integration page only documents
`@codex review` and `@codex` *"in your pull request"*
([Codex + GitHub](https://learn.chatgpt.com/docs/third-party/github)).

**I found no primary source saying a GitHub issue can start a Codex cloud task.** Its
absence from a list that explicitly includes GitLab issues reads as deliberate, but that
is my inference, not a documented statement.

Codex can open a PR: *"open a pull request when the work is ready"* — after you review.
The docs do not state which ChatGPT plans include Codex cloud, or its rate limits.
**Not verified.**

### Google Jules

Native trigger, from the primary doc:

> You can start a task from a GitHub issue by applying the label "jules" (case
> insensitive). Make sure that the Jules GitHub app is authorized to access the repo. …
> When Jules is finished with the issue, it will provide a link to the pull request where
> you can review its work.
> — [Running tasks](https://jules.google/docs/running-tasks/)

Where it runs: a cloud VM that clones the repo. Auth: the Jules GitHub App, installed via
the Jules web app.

**This is the one that answers the cross-repo question cleanly.** The REST API makes the
target repo an explicit parameter:

```
POST https://jules.googleapis.com/v1alpha/sessions
{
  "prompt": "Create a boba app!",
  "sourceContext": {
    "source": "sources/github/bobalover/boba",
    "githubRepoContext": { "startingBranch": "main" }
  },
  "automationMode": "AUTO_CREATE_PR",
  "title": "Boba App"
}
```

with the response later carrying `outputs[].pullRequest.url`
([Jules REST API quickstart](https://jules.google/docs/api/reference/)). Auth is an API key
in the `X-Goog-Api-Key` header, max 3 keys per account. *"By default, no PR will be
automatically created"* — `AUTO_CREATE_PR` is opt-in. Sessions created via API have plans
auto-approved unless `requirePlanApproval` is true. The API is *"in an alpha release,
which means it is experimental"*.

So: a workflow in `gal-arcade` fired by an issue label can `curl` a Jules session against
`sources/github/galmadar/cranes-game` and get a PR there. That is the shortest documented
cross-repo path I found.

Limits and price ([Limits and Plans](https://jules.google/docs/usage-limits/)):

| Plan | Daily tasks (rolling 24h) | Concurrent | Model |
|---|---|---|---|
| Jules (free) | 15 | 3 | Gemini 2.5 Pro |
| Jules in Pro | 100 | 15 | higher access to Gemini 3 Pro |
| Jules in Ultra | 300 | 60 | priority access |

Paid tiers ride on Google AI Pro / Ultra. Caveat straight from the doc: *"Paid Jules plans
are accessed via a Google AI Plans subscription, which is currently available only for
individual Google Accounts (ending in @gmail.com)."* The doc does not put a dollar figure
on Google AI Pro/Ultra; **I did not verify those prices**. Also: 18+ only.

### Claude Code routines

The Anthropic-hosted counterpart to the Action. Research preview, on Pro/Max/Team/Enterprise.

> A routine is a saved Claude Code configuration: a prompt, one or more repositories, and
> a set of connectors, packaged once and run automatically. Routines execute on
> Anthropic-managed cloud infrastructure
> — [Routines](https://code.claude.com/docs/en/routines)

Three trigger types: schedule, API (POST to a per-routine `/fire` endpoint with a bearer
token), and GitHub events. **The GitHub trigger does not cover issues** — the supported
events table lists exactly two categories: *Pull request* and *Release*.

But routines are natively multi-repo — *"Add one or more GitHub repositories for Claude to
work in"* — and the docs give a cross-repo example outright:

> **Library port.** A GitHub trigger runs on `pull_request.closed` filtered to merged PRs
> in one SDK repository. The routine ports the change to a parallel SDK in another
> language and opens a matching PR

So the shape that fits the arcade is: issue-labeled workflow in `gal-arcade` → POST to the
routine's `/fire` endpoint with the issue body as `text` → routine has `cranes-game` in its
repositories → PR there. Two things to know about that:

1. Fire text is deliberately inert by default. *"It arrives wrapped in a
   `<routine-fire-payload>` block that labels it as untrusted data and tells Claude not to
   follow instructions inside it unless the routine's own prompt says to."* The saved prompt
   must reference the payload explicitly.
2. *"Anything a routine does through your connected GitHub identity or connectors appears
   as you: commits and pull requests carry your GitHub user."* No bot identity to review
   against — the PR looks like Gal opened it.

Branch rules: Claude pushes to `claude/`-prefixed branches, *"which are always accepted"*;
pushing elsewhere is rejected if the branch is protected, has someone else's open PR, or
carries commits authored by someone else.

Limits: subscription usage plus *"a daily cap on how many runs can start per account"*
(the doc does not name the number; it points at claude.ai/code/routines). GitHub webhook
events additionally have *"per-routine and per-account hourly caps. Events beyond the limit
are dropped until the window resets."* Numbers not published — **unverified**.

Related: [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)
cloud sessions have a useful property — *"a cloud session can access any repository the
connecting GitHub account can see, not just the repositories the Claude GitHub App is
installed on"* — but sessions are started by a human at claude.ai, not by an issue.

### Cursor Automations

The only product I found whose native event list includes a GitHub issue label:

> **Issue label changed** - When a label is added to or removed from a non-PR issue.
> — [Automations](https://cursor.com/docs/cloud-agent/automations)

Also `Issue comment`, plus webhook triggers (*"POST to the endpoint to start a run"*) and
Linear/Slack/Sentry/PagerDuty. PR creation is on by default:

> Repo-backed automations can open pull requests after making code changes requested by
> the automation prompt. This tool is enabled by default for every automation. **The pull
> request is opened against the repositories specified for the source control trigger.
> For other triggers, it uses the repositories specified by the environment.**

So a *source-control* trigger PRs back into the triggering repo — same-repo only. A
*webhook* trigger PRs into whatever the environment names — cross-repo works. Whether an
"Issue label changed" trigger counts as a source-control trigger for that rule is not
stated. **Unverified.**

Setup friction for this account shape: *"Requires Cursor admin access and GitHub org admin
access"* ([Cursor + GitHub](https://cursor.com/docs/integrations/github)). Gal's repos sit
on a personal account, not an org. Whether the integration works without an org is
**unverified**.

Price: Hobby free, Individual from $20/mo, Teams $40/user/mo
([Cursor pricing](https://cursor.com/pricing)). Cloud agents are listed under Individual;
"Cloud agents and automations with shared team context" is listed under Teams, so whether
Automations are available on the $20 individual plan is **unverified**. Billing is
*"based on cloud agent usage"*.

### Devin

Not covered. Every documentation URL I tried under `docs.devin.ai` returned 404, and I
would not report pricing or triggers from a third-party blog. **Not researched.**

---

## 5. What a run costs

### GitHub Actions

From [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions):

> GitHub Actions usage is **free** for **self-hosted runners** and for **public
> repositories** that use standard GitHub-hosted runners.

All three arcade repos are public, so **the runner minutes are free today**. For reference
if anything ever goes private: GitHub Free includes 2,000 minutes/month, GitHub Pro 3,000,
and a Linux 2-core runner is $0.006/minute.

### Anthropic tokens

Per-million-token rates from [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing):

| Model | Input | Output |
|---|---|---|
| Claude Opus 5 | $5 | $25 |
| Claude Sonnet 5 | $2 | $10 |
| Claude Haiku 4.5 | $1 | $5 |

Cache reads are 0.1x base input; a 5-minute cache write is 1.25x.

Or skip API billing entirely: the OAuth-token path bills against a Claude subscription —
Pro $20/mo billed monthly ($17 with annual), Max from $100/mo, and *"Every plan has usage
limits that reset on a rolling five-hour session window, and paid plans add weekly limits
on top"* ([claude.com/pricing](https://claude.com/pricing)).

**I am not going to put a dollar figure on "a typical run".** It depends on the request,
the codebase and the turn count, none of which are known yet, and no source publishes an
average. The honest answer is: measure it on the first ten real runs. What *is* knowable
in advance is the cap — `--max-turns` plus `timeout-minutes` bound it.

### GitHub Copilot

From [Copilot plans](https://docs.github.com/en/copilot/get-started/plans):

| Plan | Price | GitHub AI Credits |
|---|---|---|
| Copilot Free | Free | an allowance |
| Copilot Pro | $10/mo | Base: 1,000 |
| Copilot Pro+ | $39/mo | Base: 3,900 |
| Copilot Max | $100/mo | Base: 10,000 |
| Copilot Business | $19/seat/mo | 1,900/user/mo |
| Copilot Enterprise | $39/seat/mo | 3,900/user/mo |

Cloud agent is excluded from Copilot Free. **How many AI credits one agent session
consumes is not published** — the doc only says it *"depends on the model used and the
number of tokens processed"*.

### Jules

Free tier: 15 tasks/day, 3 concurrent. Paid tiers ride Google AI Pro/Ultra, gmail.com
accounts only for now (§4). **Google AI plan prices not verified.**

---

## 6. Getting across the repo boundary

Since the two Claude/Copilot paths are repo-locked, here is what the primary sources
actually support.

### The generic escape hatch: `repository_dispatch`

A workflow on `gal-arcade` (fired by `issues: [labeled]`) calls the dispatch endpoint on
the game repo; a workflow on the game repo does the agent work in its own repo, with its
own repo-scoped token. Nothing crosses a token boundary except one API call.

> You can use this endpoint to trigger a webhook event called `repository_dispatch` when
> you want activity that happens outside of GitHub to trigger a GitHub Actions workflow …
> The `client_payload` parameter is available for any extra information that your workflow
> might need.
> — [REST: create a repository dispatch event](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event)

Permissions and limits, verbatim from that page:

- Fine-grained tokens (App user token, App installation token, or fine-grained PAT) need
  **"Contents" repository permissions (write)** on the *target* repo.
- Classic PATs / OAuth app tokens need the `repo` scope.
- `event_type` ≤ 100 characters; `client_payload` max **10 top-level properties**, total
  payload **< 64KB**.

64KB is plenty for an issue title, body, number and URL.

Two gotchas, both documented:

1. `GITHUB_TOKEN` on the shelf repo cannot do this — its permissions are limited to its
   own repo ([GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token)).
   You need a cross-repo credential.
2. `repository_dispatch` is one of the named exceptions to *"Events triggered by the
   `GITHUB_TOKEN` will not create a new workflow run"*, so the downstream workflow does fire.

### Where the cross-repo credential comes from

[`actions/create-github-app-token`](https://github.com/actions/create-github-app-token) —
GitHub's own action — mints an installation token for repos other than the current one:

```yaml
- uses: actions/create-github-app-token@v3
  id: app-token
  with:
    client-id: ${{ vars.APP_CLIENT_ID }}
    private-key: ${{ secrets.APP_PRIVATE_KEY }}
    owner: ${{ github.repository_owner }}
    repositories: |
      repo1
      repo2
```

(the README's *"Create a token for multiple repositories in the current owner's
installation"* example; there is also an `owner: another-owner` variant). Tokens expire
after 1 hour. This means registering a small GitHub App of your own — client ID as a repo
variable, private key as a repo secret.

The alternative is a fine-grained PAT with Contents:write on the game repos, stored as a
secret on the shelf. Simpler; but `claude-code-action`'s security doc explicitly advises
against static PATs in a workflow an agent runs in, because a long-lived token *"does not
rotate between runs and could be partially or fully recovered over time via prompt
injection"*. If the PAT is only used by a plain `curl` step *before* the agent step, that
reasoning does not apply — but that's my reading, **not a documented carve-out**.

### The other two cross-repo routes

- **Jules REST API** — name the target repo in `sourceContext.source`, set
  `automationMode: AUTO_CREATE_PR`. One `curl` from any workflow. (§4)
- **Claude Code routine `/fire`** — routine holds the game repos; the shelf workflow POSTs
  the issue text. (§4)

Both replace "workflow in the game repo" with "hosted agent that already has the game
repo", which is fewer moving parts than the dispatch fan-out — at the cost of a
research-preview / alpha dependency in each case.

### What I could *not* verify

Whether `claude-code-action` can be pushed across the boundary directly — check out
`cranes-game` with `actions/checkout`'s `repository:` + `token:` inputs
([checkout action.yml](https://github.com/actions/checkout/blob/main/action.yml) confirms
both inputs exist and that `repository` defaults to `github.repository`), pass a
cross-repo `github_token`, and run the action in automation mode. Every individual piece is
documented. **The combination is not, and the action's security doc says the opposite about
its own token.** Do not assume this works; test it before designing around it.

---

## 7. The thing that decides the shape

Two facts, both from primary sources, do most of the work here:

1. **Every action-based agent refuses non-collaborators by default.** Claude Code Action:
   *"the triggering user must have write access"*. Codex Action: *"By default only users
   with write access can run the action."* Jules Action README: *"Always restrict who can
   trigger Jules for sources like GitHub issues."* Players who are "known people sent a
   link" are exactly the people this gate blocks. Either they become collaborators (write
   access on a public repo is a real grant), or the request arrives through something that
   is *not* a player-authored GitHub event — which points at an intake surface on the shelf
   that Gal or a workflow turns into the trigger.

2. **The repo split rules out the two most turnkey options.** Copilot cloud agent —
   *"cannot make changes across multiple repositories in one run"*. Claude Code Action —
   *"No Cross-Repository Access"*. What survives either bridges the gap with
   `repository_dispatch`, or uses a hosted runner that takes the target repo as a parameter
   (Jules API, Claude routines, Cursor webhook automations).

Both point the same way: the request loop probably wants a small piece of glue on the shelf
that turns a filed request into a trigger aimed at a specific game repo, rather than an
agent that reads shelf issues directly.

---

## Sources

- Claude Code GitHub Actions — https://code.claude.com/docs/en/github-actions
- claude-code-action `action.yml` — https://github.com/anthropics/claude-code-action/blob/main/action.yml
- claude-code-action security — https://github.com/anthropics/claude-code-action/blob/main/docs/security.md
- claude-code-action usage — https://github.com/anthropics/claude-code-action/blob/main/docs/usage.md
- claude-code-action FAQ — https://github.com/anthropics/claude-code-action/blob/main/docs/faq.md
- Claude Code on the web — https://code.claude.com/docs/en/claude-code-on-the-web
- Claude Code routines — https://code.claude.com/docs/en/routines
- Claude API pricing — https://platform.claude.com/docs/en/about-claude/pricing
- Claude subscription pricing — https://claude.com/pricing
- GITHUB_TOKEN — https://docs.github.com/en/actions/concepts/security/github_token
- GitHub Actions billing — https://docs.github.com/en/billing/concepts/product-billing/github-actions
- REST: repository dispatch — https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event
- actions/checkout — https://github.com/actions/checkout/blob/main/action.yml
- actions/create-github-app-token — https://github.com/actions/create-github-app-token
- Copilot cloud agent — https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent
- Copilot: assign an issue — https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/assign-copilot-to-an-issue
- Copilot plans — https://docs.github.com/en/copilot/get-started/plans
- Codex cloud — https://learn.chatgpt.com/docs/cloud
- Codex + GitHub — https://learn.chatgpt.com/docs/third-party/github
- Codex GitHub Action — https://learn.chatgpt.com/docs/github-action
- Jules: running tasks — https://jules.google/docs/running-tasks/
- Jules REST API — https://jules.google/docs/api/reference/
- Jules limits and plans — https://jules.google/docs/usage-limits/
- google-labs-code/jules-action — https://github.com/google-labs-code/jules-action
- Cursor Automations — https://cursor.com/docs/cloud-agent/automations
- Cursor + GitHub — https://cursor.com/docs/integrations/github
- Cursor pricing — https://cursor.com/pricing
