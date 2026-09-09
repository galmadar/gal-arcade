# Reading issues onto the arcade without a token in the browser

Research for [#15](https://github.com/galmadar/gal-arcade/issues/15), part of the map in
[#1](https://github.com/galmadar/gal-arcade/issues/1).

Every factual claim below carries a URL. Where a source does not answer the question, this
file says so rather than filling the gap. Claims marked **measured** were verified by
calling `api.github.com` directly on **2026-09-09** from one home IP; the raw numbers are
included so they can be re-run. GitHub says the rate limits and the point formula are
"subject to change", so treat the numbers as a snapshot.

---

## 0. The answer in one paragraph

A static page **can** read issues and comments from your public repos with no token at all —
every endpoint the board needs works unauthenticated, and GitHub sets
`Access-Control-Allow-Origin: *` on the REST API, so the browser is an explicitly supported
caller. The ceiling is **60 requests per hour per IP address**, shared by everyone behind
that IP. A naive multi-repo page load costs about 6 requests, so roughly **10 page loads per
hour per IP** — thin, and the failure is a hard 403 that shows the visitor an empty board.
Two things change the arithmetic without a serverless function: the **search endpoint has
its own separate 10-requests-per-minute bucket** and can return issues from all three repos
in one call, and comments can be fetched lazily only when a thread is opened. That gets a
typical load down to 1 search request plus 1 core request per opened thread. Conditional
requests (ETag) do **not** help unauthenticated callers — GitHub's doc is explicit that a
304 is free only when the request carried an `Authorization` header, and I measured that it
is not free without one. A server-side function holding a token moves the whole board onto
**5,000 requests/hour** with **free 304s**, and GraphQL — which cannot be called
unauthenticated at all — makes the whole three-repo fetch **one HTTP request costing 3
points out of 5,000/hour** (measured). So the token question and the GraphQL question are
the same question: both only exist on the far side of a server-side function.

---

## 1. Unauthenticated REST on public repos

### 1.1 It is a supported mode, not a loophole

> You can make unauthenticated requests if you are only fetching public data. Unauthenticated
> requests are associated with the originating IP address, not with the user or application
> that made the request.
>
> The primary rate limit for unauthenticated requests is **60 requests per hour**.

— [Rate limits for the REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#primary-rate-limit-for-unauthenticated-users)
(source text: [`data/reusables/rest-api/primary-rate-limit-unauthenticated-users.md`](https://github.com/github/docs/blob/main/data/reusables/rest-api/primary-rate-limit-unauthenticated-users.md))

### 1.2 The endpoints the board needs, all working with no token

**Measured** — each returned `HTTP 200` with no `Authorization` header:

| Endpoint | Purpose | Docs |
|---|---|---|
| `GET /repos/{owner}/{repo}/issues` | the request list for one repo | [List repository issues](https://docs.github.com/en/rest/issues/issues?apiVersion=2022-11-28#list-repository-issues) |
| `GET /repos/{owner}/{repo}/issues/comments` | **every** issue comment in a repo, one call | [List issue comments for a repository](https://docs.github.com/en/rest/issues/comments?apiVersion=2022-11-28#list-issue-comments-for-a-repository) |
| `GET /repos/{owner}/{repo}/issues/{n}/comments` | one thread's comments | [List issue comments](https://docs.github.com/en/rest/issues/comments?apiVersion=2022-11-28#list-issue-comments) |
| `GET /search/issues` | issues across several repos in **one** call | [Search issues and pull requests](https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#search-issues-and-pull-requests) |

Two shapes worth knowing:

- The issues endpoint returns pull requests as well. *"GitHub's REST API considers every pull
  request an issue, but not every issue is a pull request. For this reason, 'Issues' endpoints
  may return both issues and pull requests in the response. You can identify pull requests by
  the `pull_request` key."*
  — [List repository issues](https://docs.github.com/en/rest/issues/issues?apiVersion=2022-11-28#list-repository-issues).
  The board must filter on `pull_request`.
- Pagination caps a page at 100 (`per_page` "default: 30, max: 100"), and the next page is a
  further request. More than 100 open requests, or more than 100 comments in a repo, adds
  requests per load.
  — [Using pagination in the REST API](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api)

### 1.3 Shared IPs and IPv6

The documented rule is only the sentence above: the bucket is keyed on **the originating IP
address**. Everything else follows from it rather than from a further statement:

- **Shared IP.** Several visitors behind one NAT — a household, an office, a school, a VPN
  exit node, a mobile carrier's CGNAT — draw down **one** 60/hour bucket between them. A
  five-person family on one router gets the same 60 requests an hour that one person does.
  I could not find a GitHub page that spells this consequence out; it is an inference from
  the documented keying, not a quoted claim.
- **IPv6.** **Not documented.** I read the whole rate-limits page source and searched the
  entire `github/docs` repository for "IPv6" alongside "rate limit" — the only hits are
  webhook source ranges and OAuth, neither about rate-limit bucketing
  ([search](https://github.com/search?q=repo%3Agithub%2Fdocs+%22IPv6%22+%22rate+limit%22&type=code)).
  GitHub does not say whether an IPv6 client is bucketed per address, per `/64`, or per some
  wider prefix. **Measured:** on 2026-09-09 from this machine, `api.github.com` returned no
  `AAAA` record at all (only `A 20.217.135.0`), so browsers here reach the API over IPv4 and
  the question is currently moot. That is a DNS observation from one network on one day, not
  a guarantee — do not build on it.

The [changelog that tightened unauthenticated limits](https://github.blog/changelog/2025-05-08-updated-rate-limits-for-unauthenticated-requests/)
(May 2025, covering "anonymous REST API interactions" among others) says GitHub acted because
of scraping, and steers callers to authenticate. It gives no IP-bucketing detail either.

---

## 2. Is 60/hour survivable for this board?

### 2.1 The naive arithmetic

Three repos (`gal-arcade`, `rail-yard`, `cranes-game`), issues plus comments:

| Approach | Requests per page load | Loads/hour/IP |
|---|---|---|
| Per-repo issues + per-repo all-comments | 3 + 3 = **6** | **10** |
| Per-repo issues only, comments lazily on thread open | **3** + 1 per opened thread | **20**, minus threads read |
| `GET /search/issues` once + comments lazily | **0 core** + 1 per opened thread | see 2.2 |

Ten loads per hour per IP is survivable for "a small group of known people" only in the sense
that it usually will not break. It breaks exactly when the board is being used hardest — two
people in the same house, someone refreshing, a page that re-fetches on tab focus. And it
breaks badly: `403`/`429` with `x-ratelimit-remaining: 0`, for **up to an hour**
([Exceeding the rate limit](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#exceeding-the-rate-limit)).

### 2.2 The search endpoint is a separate bucket — this is the real headroom

> The REST API has a custom rate limit for searching. For authenticated requests, you can make
> up to 30 requests per minute for all search endpoints except for the Search code endpoint.
> […] **For unauthenticated requests, the rate limit allows you to make up to 10 requests per
> minute.**

— [REST API endpoints for search § Rate limit](https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#rate-limit)

**Measured:** an unauthenticated `GET /search/issues` returned `x-ratelimit-resource: search`,
`x-ratelimit-limit: 10` — a bucket entirely separate from `core`'s 60/hour. Ten per minute is
**600 an hour**, ten times the core allowance.

And one search call covers all three repos. **Measured**, both of these returned the same 12
open issues in one request:

```
# legacy syntax: a space between repo: qualifiers is OR
/search/issues?q=is:issue+is:open+repo:galmadar/gal-arcade+repo:galmadar/rail-yard

# advanced syntax: explicit OR (space becomes AND here — see below)
/search/issues?q=is:issue+state:open+AND+(repo:galmadar/gal-arcade+OR+repo:galmadar/rail-yard)&advanced_search=true
```

Also **measured**: `q=is:issue+is:open+user:galmadar` returns issues from every repo the
account owns in one call — no need to list repos.

The AND/OR trap is real and cost me a wrong result before I found the explanation: *"a space
between multiple repo, org, and user filter qualifiers is treated as an AND operator in
advanced search, whereas without advanced search, a space is treated as an OR operator"*
— [API support for issues advanced search](https://github.blog/changelog/2025-03-06-github-issues-projects-api-support-for-issues-advanced-search-and-more/).
With `advanced_search=true` and two bare `repo:` qualifiers I got `total_count: 0`.

Caveats on search: it returns *"up to 1,000 results for each search"*
([About search](https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#about-search)) —
irrelevant at this scale; it returns issue bodies but **not** comments, so threads still cost a
`core` request each; and I could not find `advanced_search` documented anywhere in
`github/docs` content, only announced in the changelog above. It works today either way.

### 2.3 What the headers report

Every response carries the current state of the bucket:

| Header | Description |
|---|---|
| `x-ratelimit-limit` | The maximum number of requests that you can make per hour |
| `x-ratelimit-remaining` | The number of requests remaining in the current rate limit window |
| `x-ratelimit-used` | The number of requests you have made in the current rate limit window |
| `x-ratelimit-reset` | The time at which the current rate limit window resets, in UTC epoch seconds |
| `x-ratelimit-resource` | The rate limit resource that the request counted against |

— [Checking the status of your rate limit](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#checking-the-status-of-your-rate-limit)

**Measured**, unauthenticated `GET /repos/galmadar/gal-arcade/issues`:

```
x-ratelimit-limit: 60
x-ratelimit-remaining: 58
x-ratelimit-used: 2
x-ratelimit-resource: core
x-ratelimit-reset: 1788959826
```

Crucially for a browser board, GitHub lists these in `access-control-expose-headers`
(**measured**: `ETag, Link, Location, Retry-After, … X-RateLimit-Limit, X-RateLimit-Remaining,
X-RateLimit-Used, X-RateLimit-Resource, X-RateLimit-Reset, …`), so client-side JavaScript can
actually read them and warn the visitor instead of showing a silently empty board.

`GET /rate_limit` also exists and *"does not count against your primary rate limit"*, but the
docs say to prefer the headers
([same page](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#checking-the-status-of-your-rate-limit)).

### 2.4 Secondary limits are not the binding constraint here

For completeness: no more than 100 concurrent requests; no more than 900 points/minute to REST
endpoints (a `GET` is 1 point); no more than 90 seconds of CPU per 60 seconds of real time
— [About secondary rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#about-secondary-rate-limits).
A board doing six GETs a load will never come near these. They are worth knowing only because
*"Continuing to make requests while you are rate limited may result in the banning of your
integration"* (same page).

---

## 3. What changes with a token behind a server-side function

### 3.1 The limit

> All of these requests count towards your personal rate limit of **5,000 requests per hour**.

— [Primary rate limit for authenticated users](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#primary-rate-limit-for-authenticated-users)

Two consequences specific to this design:

- The 5,000 is **per user account**, not per visitor. One shared token means one bucket for
  the whole board — but 5,000/hour against a handful of known people is not a constraint,
  it is effectively unlimited. It is the same bucket Gal's own `gh` CLI draws on, though.
- If a GitHub App were used instead, an installation gets *"the installation's minimum rate
  limit of 5,000 requests per hour"*, scaling with repos and users up to 12,500
  ([App installations](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#primary-rate-limit-for-github-app-installations)).
  No gain worth the complexity at this size.
- A fine-grained personal access token needs no special grant for this: *"All fine-grained
  personal access tokens include read access to public repositories."*
  — [Authenticating with GraphQL](https://docs.github.com/en/graphql/guides/forming-calls-with-graphql#authenticating-with-a-personal-access-token)

### 3.2 Conditional requests: free 304s, **but only when authenticated**

This is the single most decision-relevant sentence in GitHub's docs for this ticket, and the
qualifier at the end is easy to miss:

> Most endpoints return an `etag` header, and many endpoints return a `last-modified` header.
> You can use the values of these headers to make conditional `GET` requests. If the response
> has not changed, you will receive a `304 Not Modified` response. **Making a conditional
> request does not count against your primary rate limit if a `304` response is returned and
> the request was made while correctly authorized with an `Authorization` header.** This makes
> conditional requests especially useful when you poll an endpoint, because each `304 Not
> Modified` response is fast and does not use your rate limit.

— [Best practices § Use conditional requests](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#use-conditional-requests)
(source text: [`content/rest/using-the-rest-api/best-practices-for-using-the-rest-api.md`](https://github.com/github/docs/blob/main/content/rest/using-the-rest-api/best-practices-for-using-the-rest-api.md))

**Measured, both directions.**

Unauthenticated, sending back the ETag — the 304 arrived *and still cost a request*:

```
call 1  HTTP 200   x-ratelimit-used: 5
call 2  HTTP 304   x-ratelimit-used: 6   x-ratelimit-remaining: 54
```

Authenticated with a token, the same experiment — two 304s in a row cost nothing:

```
call 1  HTTP 200   x-ratelimit-used: 80
call 2  HTTP 304   x-ratelimit-used: 80   x-ratelimit-limit: 5000
call 3  HTTP 304   x-ratelimit-used: 80
```

So ETags raise the effective ceiling enormously **behind a token** (a board that polls a rarely
changing list is nearly free) and raise it **not at all** in the browser. The advice to keep
requests stable so more polls return 304 — *"Request only the data that you need, and keep
responses stable"* — is on the same page, as is *"Poll only as often as you need to, on a fixed
schedule. If a response includes an `x-poll-interval` header, wait at least that many seconds"*.

### 3.3 HTTP caching does give the browser a small, real saving

**Measured:** the unauthenticated issues response carries `cache-control: public, max-age=60,
s-maxage=60`. Within that 60 seconds a browser serves a repeat fetch from its own HTTP cache
with no network request and therefore no quota — so a refresh-happy visitor is cheaper than the
per-load arithmetic suggests, and a CDN in front (Vercel) could serve many visitors from one
upstream fetch. Past 60 seconds the browser revalidates, and per §3.2 that revalidation costs a
request when unauthenticated. I did not find this `cache-control` value documented on any GitHub
page; it is an observation from the live API and could change.

### 3.4 GitHub's own advice about where the token lives

- *"Never hardcode authentication credentials like tokens, keys, or app-related secrets into
  your code."*
  — [Keeping your API credentials secure](https://docs.github.com/en/rest/authentication/keeping-your-api-credentials-secure#use-authentication-credentials-securely-in-your-code)
- *"Never include your app's client secret in client-side code or in code that runs on a user
  device."*
  — [Rate limits for the REST API § OAuth apps](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#primary-rate-limit-for-oauth-apps)
- *"You may not share API tokens to exceed GitHub's rate limitations."*
  — [Terms of Service § H. API Terms](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#h-api-terms)

That last one is worth reading twice for this board's shape: a single bot token used by every
visitor's browser to get past 60/hour would be squarely what that sentence forbids. The same
token used *by a server you control* is ordinary integration use. The difference is not
cosmetic.

---

## 4. GraphQL

### 4.1 It cannot be called without a token at all

Every documented path to the GraphQL endpoint goes through a credential — personal access
token, GitHub App, or OAuth app
([Authenticating with GraphQL](https://docs.github.com/en/graphql/guides/forming-calls-with-graphql#authenticating-with-graphql)) —
and the GraphQL rate-limit page lists buckets **only** for users, App installations, OAuth apps
and Actions: there is no unauthenticated tier
([Primary rate limit](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api#primary-rate-limit)).

I could not find a sentence in GitHub's docs that says in so many words "unauthenticated
GraphQL requests are rejected". **Measured** instead — `POST https://api.github.com/graphql`
with no `Authorization` header:

```
HTTP/2 403
x-ratelimit-limit: 0
x-ratelimit-remaining: 0
x-ratelimit-resource: graphql
{"message":"API rate limit exceeded for <ip>. (But here's the good news: Authenticated
 requests get a higher rate limit. …)"}
```

A zero-sized bucket. **GraphQL is only on the table if a server-side function exists.** It is
not an alternative to the token question; it is downstream of it.

### 4.2 A different accounting model: points, not requests

REST counts **requests**. GraphQL counts **points**, and the point value of a call is derived
from how many underlying fetches the resolver would need:

> * *For users*: **5,000 points per hour per user.**
>
> 1. Add up the number of requests needed to fulfill each unique connection in the call. Assume
>    every request will reach the `first` or `last` argument limits.
> 2. Divide the number by **100** and round the result to the nearest whole number to get the
>    final aggregate point value.
>
> The minimum point value of a call to the GraphQL API is **1**.

— [Rate limits and query limits for the GraphQL API](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api#primary-rate-limit)

Same headers as REST, but counting points: `x-ratelimit-limit` is *"The maximum number of
**points** that you can use per hour"*, and `x-ratelimit-resource` *"will always be `graphql`"*.
A query can also ask for its own cost via `rateLimit { cost }` (same page).

### 4.3 What the arcade's actual query costs — measured

One HTTP request, three aliased `repository` root fields, up to 100 open issues each and up to
100 comments per issue, plus `rateLimit`:

```graphql
query {
  arcade: repository(owner: "galmadar", name: "gal-arcade") {
    issues(first: 100, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
      totalCount
      nodes { number title createdAt comments(first: 100) { totalCount nodes { body author { login } } } }
    }
  }
  rail:   repository(owner: "galmadar", name: "rail-yard")   { issues(first: 100, states: OPEN) { … } }
  cranes: repository(owner: "galmadar", name: "cranes-game") { issues(first: 100, states: OPEN) { … } }
  rateLimit { limit cost remaining used resetAt nodeCount }
}
```

Result:

```json
{"cost": 3, "limit": 5000, "nodeCount": 30300, "remaining": 4812, "resetAt": "…"}
```

**3 points** for the entire board — issues *and* every comment, across all three repos, in a
single round trip. That is ~1,660 full board loads per hour against the 5,000-point budget,
versus the 6 REST requests the same data would take. The node count, 30,300, is well under the
documented ceiling: *"Individual calls cannot request more than 500,000 total nodes"*, and
*"Values of `first` and `last` must be within 1-100"*
([Node limit](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api#node-limit)).

Two GraphQL-only risks worth carrying into a design:

- **Timeouts.** *"If GitHub takes more than 10 seconds to process an API request, GitHub will
  terminate the request"* with a `502` or `504`, and *"If a timeout occurs for any of your API
  requests, additional points will be deducted from your primary rate limit for the next hour"*
  ([Timeouts](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api#timeouts)).
  A greedy `comments(first: 100)` on every issue is exactly the shape that gets there as the
  board grows.
- **Exceeding the limit does not look like an error.** *"If you exceed your primary rate limit,
  the response status will still be `200`, but you will receive an error message"* (same page).
  The client must check the `errors` array, not just the status.

**Not verified:** whether conditional requests / ETags do anything for GraphQL. GitHub's
GraphQL docs say nothing about `etag` or `if-none-match`, and I did not test it. Assume no.

---

## 5. Is calling the API from a browser allowed?

### 5.1 CORS — explicitly supported

> The REST API supports cross-origin resource sharing (CORS) for AJAX requests from **any
> origin**.

— [Using CORS and JSONP to make cross-origin requests](https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests#cross-origin-resource-sharing-cors)

**Measured** against `api.github.com` on 2026-09-09:

```
# GET with Origin: https://gal-arcade.vercel.app
HTTP/2 200
access-control-allow-origin: *

# OPTIONS preflight
HTTP/2 204
access-control-allow-origin: *
access-control-allow-methods: GET, POST, PATCH, PUT, DELETE
access-control-allow-headers: Authorization, Content-Type, If-Match, If-Modified-Since,
  If-None-Match, If-Unmodified-Since, Accept-Encoding, …
access-control-max-age: 86400
```

`If-None-Match` is on the allow-list, so the browser *may* send conditional requests — they
just are not free (§3.2). The preflight is cached for 86,400 seconds, so it does not add a
request per load in practice. Note the same page still documents `?callback=` JSONP; that is
legacy and unnecessary given `Access-Control-Allow-Origin: *`.

One requirement that trips up hand-rolled clients: *"All API requests must include a valid
`User-Agent` header. […] Requests with no `User-Agent` header will be rejected."*
— [Getting started with the REST API](https://docs.github.com/en/rest/using-the-rest-api/getting-started-with-the-rest-api#user-agent).
Browsers set one automatically and `fetch` forbids overriding it, so this only bites the
server-side option.

### 5.2 Acceptable use and the API terms

Nothing forbids a small board reading public issues. The relevant clauses, and what each does
and does not cover:

- **API Terms.** *"Abuse or excessively frequent requests to GitHub via the API may result in
  the temporary or permanent suspension of your Account's access to the API. GitHub, in our
  sole discretion, will determine abuse or excessive usage of the API. We will make a
  reasonable attempt to warn you via email prior to suspension. **You may not share API tokens
  to exceed GitHub's rate limitations.**"*
  — [Terms of Service § H](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#h-api-terms)
- **Automated bulk activity.** The Acceptable Use Policies forbid *"using our servers for any
  form of excessive automated bulk activity, to place undue burden on our servers through
  automated means"*
  — [Acceptable Use § Spam and Inauthentic Activity](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies#4-spam-and-inauthentic-activity).
- **Scraping.** *"Scraping refers to extracting information from our Service via an automated
  process"*; it is permitted for public information, and restricted mainly against spam and
  selling personal data
  — [Acceptable Use § Information Usage Restrictions](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies#7-information-usage-restrictions).

The line that matters for this ticket is the token-sharing one. Reading public issues from the
browser inside the 60/hour limit is fine and documented. Shipping a bot token to the browser
*specifically* to get past 60/hour is what the API Terms name.

---

## 6. Options this leaves on the table

Stated as options, not a recommendation — the decision is the driving session's.

1. **Nothing server-side, search-led.** One unauthenticated `GET /search/issues` (the `search`
   bucket, 600/hour/IP) for the whole board; comments fetched from `core` only when a visitor
   opens a thread. Read `x-ratelimit-remaining` off the response and tell the visitor plainly
   if the board is temporarily rate-limited. No new infrastructure, no credential, and the
   only real exposure is a shared-IP household hammering it.
2. **One serverless function holding a fine-grained token.** Moves everything to 5,000/hour,
   makes ETag 304s free, and unlocks the single 3-point GraphQL call for the entire board. Real
   cost: the arcade stops being a pure static site, and a secret now exists that has to be
   stored, rotated and kept out of the repo.
3. **Prebuild the data.** A scheduled GitHub Actions job writes issues+comments to a JSON file
   in the repo, and the static page fetches that file. `GITHUB_TOKEN` in Actions gets *"1,000
   requests per hour per repository"*
   ([Actions](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#primary-rate-limit-for-github_token-in-github-actions)),
   the browser makes zero GitHub API calls and needs no credential, and the arcade stays fully
   static. The cost is staleness measured in the cron interval — which matters because filing a
   request and voting are *writes*, and this ticket only covers reads. **Not researched here:**
   how writes are handled is a separate question, and the write path may force a server-side
   function into existence anyway — at which point option 2's cost is already paid.

---

## 7. What I could not verify

- **How GitHub buckets unauthenticated IPv6 callers.** Not in the docs anywhere I could find.
  Currently moot on this network because `api.github.com` published no `AAAA` record on
  2026-09-09 — a single observation, not a guarantee.
- **An explicit GitHub statement that shared-IP visitors share one bucket.** The keying on
  "originating IP address" is documented; the household consequence is my inference.
- **An explicit GitHub statement that unauthenticated GraphQL is rejected.** Only measured
  (403, `x-ratelimit-limit: 0`), plus the absence of any unauthenticated tier on the GraphQL
  rate-limit page.
- **Whether ETags / conditional requests help GraphQL at all.** Undocumented and untested.
- **The `advanced_search` query parameter.** Announced in the March 2025 changelog and working
  today, but I found it in no page of `github/docs` content.
- **The `cache-control: public, max-age=60` on issue responses.** Measured, not documented;
  GitHub could change it without notice.
- **Anything about the write path** — filing an issue or a comment as a bot. Out of this
  ticket's scope and deliberately not covered.
