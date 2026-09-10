# Where the board's data lives: choosing a store behind Vercel

Research for [#11](https://github.com/galmadar/gal-arcade/issues/11), part of the map in
[#1](https://github.com/galmadar/gal-arcade/issues/1).

Every factual claim below carries a URL to the vendor's own documentation or pricing page.
Where a vendor's docs do not answer a question, this file says **UNVERIFIED** and names the
pages that were checked, rather than filling the gap from memory. Pricing and free tiers
change; all numbers are a snapshot taken on **2026-09-10**. Nothing was signed up for and no
resource was provisioned — this is a reading exercise only.

Two vendors contradict *themselves* across their own pages. Those contradictions are quoted
in full rather than resolved, because guessing which page is stale would be exactly the kind
of confident wrong number this file exists to avoid.

---

## 0. The answer in one paragraph

The free tiers are all far larger than this board will ever need — a handful of requests and
votes is orders of magnitude below every quota on this page. **The limits are not the
question. Sleep is.** A board that nobody visits for two weeks and must still work on the day
someone does eliminates most of the field on a single axis, and it eliminates them in two
distinct ways. **Supabase pauses a free project after 7 days of low activity, and only Gal,
logged into the dashboard, can click *Resume project*.** **Turso archives a free database
after 10 days of inactivity, restorable only by `turso group unarchive` or a Platform API
call with the owner's token.** **Upstash archives a free Redis database after "a minimum of 30
days" of inactivity by *removing the database instance* — the data survives as a backup you
restore by hand.** All three fail the requirement, and they fail it the same way: a stranger's
page load cannot revive them; only Gal can, and only after he notices. **Neon and Firestore
are the two that survive.** Neon suspends compute after 5 minutes idle and archives a branch
after 14 days, but both wake **automatically** on the first query — "a few hundred
milliseconds", by Neon's own number. Firestore documents no idle state at all. Between those
two, the decisive difference is the one Gal already named: **"I log in."** Firestore ships
Firebase Authentication in the box, free, usable from a `<script type="module">` tag with no
build step, and enforced *in the database* by Security Rules reading `request.auth.uid`. Neon
has no comparable story — its own auth is in Beta, and every read and write must be
proxied through a serverless function because a Postgres connection string can never reach a
browser. **The recommendation is Firestore**, with **Cloudflare D1 called over its REST API
from a dependency-free Vercel function** as the runner-up worth knowing about, and Neon as
the pick if the board must be relational.

---

## 1. What the board actually needs, restated as tests

Nothing below is scored on general merit. Each option is scored against these six:

| # | Test | Why it is hard |
|---|---|---|
| 1 | **It is awake on day 15.** | Traffic may be zero for weeks. A store that sleeps and needs a human to wake it is a store that is down. |
| 2 | **Strangers can write.** | No accounts. Anyone, anywhere, opens a request, votes, comments. |
| 3 | **The owner, and only the owner, sets status.** | Gal explicitly chose "I log in". Built-in auth vs bolted-on auth is decisive, not cosmetic. |
| 4 | **One vote per browser, enforced by the store.** | The browser sends a random id. A second vote with the same id must be rejected by the database, not by trusting the page. |
| 5 | **Sortable by votes and by date.** | Both orderings, on reads a stranger triggers. |
| 6 | **It costs the repo as little as possible.** | `gal-arcade` is `index.html` + `requests.html`. No `package.json`, no build step, no dependencies, no framework. |

Test 6 needs a number attached to it, which is the next section.

---

## 2. What adding a backend costs this repo — the Vercel facts

This section applies to every option below, so it is settled once here.

### 2.1 A serverless function does not, by itself, require a build step

Vercel's Node.js runtime doc shows a function in `/api` with no framework and no config:

> To use the Node.js runtime for an individual Vercel Function, create a file inside the
> `/api` directory with a function using the `fetch` Web Standard export. **No additional
> configuration is needed**

— [Using the Node.js Runtime with Vercel Functions](https://vercel.com/docs/functions/runtimes/node-js)

And dependency installation is conditional on a `package.json` existing at all:

> **For dependencies listed in a `package.json` file at the root of a project**, the
> following behavior is used: If `bun.lock` or `bun.lockb` is present, `bun install` is
> executed […] Otherwise, `npm install` is executed

— [same page](https://vercel.com/docs/functions/runtimes/node-js)

**So the cost of "add a serverless function" and the cost of "add a dependency" are two
different costs, and only the second one ends the repo's zero-config life.** A file
`api/vote.js` that calls a vendor's HTTPS endpoint with the built-in `fetch` adds no
`package.json`, no lockfile, no `node_modules`, no install step on deploy, and nothing to keep
patched. An `import` of `@supabase/supabase-js`, `@neondatabase/serverless`, `@upstash/redis`
or `@libsql/client` adds all of it.

Every vendor below that publishes an HTTP/REST endpoint can therefore be used **dependency-free
from a Vercel function**. That is worth more here than any free-tier number, and it is the
single most useful finding in this file.

### 2.2 Vercel's own limits are not a constraint at this traffic

| Resource | Hobby included usage |
|---|---|
| Function Invocations | First 1,000,000 |
| Active CPU | 4 CPU-hrs |
| Provisioned Memory | 360 GB-hrs |
| Edge Requests | Up to 1,000,000 |
| Function max duration | 300s (5 minutes) |
| Function max memory | 2 GB / 1 vCPU |

— [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby), [Vercel Functions Limits](https://vercel.com/docs/functions/limitations)

On exceeding them:

> As the Hobby plan is a free tier there are no billing cycles. In most cases, if you exceed
> your usage limits on the Hobby plan, you will have to wait until 30 days have passed before
> you can use the feature again.

— [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby)

Worth noting in passing, since the board is a public site: the same page states that "the
Hobby plan restricts users to non-commercial, personal use only", per the
[fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage).
A feature request board for personal browser games is squarely inside that.

### 2.3 Vercel itself does not sleep

Vercel's own guide to why a deployment gets paused lists four causes — a budget cap you set,
a usage limit, a policy violation, or a platform incident — and **inactivity is not among
them**
([Why has my account or deployment been paused?](https://vercel.com/kb/guide/why-is-my-account-deployment-blocked)).
Functions do scale to zero between requests, so a first request pays a function cold start,
but the deployment is always there. **Whatever sleeps in this system, it is not Vercel.**

### 2.4 Vercel no longer sells a database

This matters because the ticket names "Vercel Postgres / Neon" and "Vercel KV". Both
first-party products are gone:

> Vercel Postgres is no longer available. If you had an existing Vercel Postgres database, we
> automatically moved it to [Neon](https://vercel.com/marketplace/neon) in December 2024. For
> new projects, install a Postgres integration from the Marketplace.

— [Postgres on Vercel](https://vercel.com/docs/postgres)

> Vercel KV is no longer available. If you had an existing Vercel KV store, we automatically
> moved it to [Upstash Redis](https://vercel.com/marketplace/upstash) in December 2024. For
> new projects, install a Redis integration from the Marketplace.

— [Redis on Vercel](https://vercel.com/docs/redis)

Vercel's storage overview now lists only **Blob**, **Global Config** and **Marketplace
storage** ([Vercel Storage overview](https://vercel.com/docs/storage)). Databases come from
"providers like Neon, Upstash, and Supabase", provisioned with `vercel install neon`, and
Vercel "injects provisioned resource credentials as environment variables".

When the Marketplace launched, Vercel promised parity: *"Pricing and limits will match what
you'd get by going direct to Neon and Upstash"*
([Introducing the Vercel Marketplace](https://vercel.com/blog/introducing-the-vercel-marketplace)).
**UNVERIFIED:** no page on vercel.com enumerates the Marketplace free-plan limits for any
provider — `vercel.com/marketplace/neon` says only "Plans starting at $0". Every number in
this file is therefore the vendor's own published figure, not a Vercel-mediated one. Checked:
`vercel.com/marketplace/neon`, `vercel.com/marketplace/neon/neon`,
`vercel.com/docs/marketplace-storage`, `neon.com/docs/guides/vercel-native-integration`.

**So "put it on Vercel" is not an option in its own right.** Every option below is a
third-party account that Gal keeps alive, whether it is billed through Vercel or not.

---

## 3. The decisive axis: what happens after two weeks of silence

This is the table the decision turns on. It is placed before the per-option detail because it
removes half the field on its own.

| Option | Documented idle behaviour | Wakes by itself? | Board on day 15 |
|---|---|---|---|
| **Supabase** | Paused after **7 days** of low activity | **No** — dashboard *Resume project* | ❌ **Dark** |
| **Turso** | Archived after **10 days** of inactivity (free plan) | **No** — `turso group unarchive` / Platform API | ❌ **Dark** |
| **Upstash Redis** | Archived after **"a minimum of 30 days"** — instance removed, data kept as a backup | **No** — restore from console | ⚠️ Alive at 15 days, gone at ~30 |
| **Neon** | Compute suspends after **5 min**; branch archived after **14 days** old + 24h untouched | **Yes, both** | ✅ Works, "a few hundred ms" |
| **Firestore** | No idle state documented | n/a | ✅ Works |
| **Cloudflare D1** | No idle state documented | n/a | ✅ Works |
| **PocketBase on a free host** | Depends entirely on the host | see §4.7 | ⚠️ Usually ❌ |
| **File in the repo + Actions** | Never sleeps (it is a static file) | n/a | ✅ Works — but see §4.8 |

The three ❌ rows fail for the same structural reason and it is worth stating plainly: **the
recovery action requires the owner's credentials.** A visitor arriving on day 15 cannot
trigger it, cannot see why the board is broken, and has no way to tell Gal. The board is down
until Gal happens to look. For a board whose entire purpose is to catch a player's thought at
the moment they have it, that is the worst possible failure mode — it is silent, and it
happens precisely when the board has been quiet, which is most of the time.

There is a workaround for all three — a scheduled ping keeping the store warm — and it should
be named honestly rather than waved at. It means **a cron job whose only purpose is to lie to
the vendor about whether the project is in use**, which then becomes a second thing that can
break silently, and whose failure looks exactly like the failure it was added to prevent.
That is more machinery than this board is worth, and it is machinery that this repo currently
has none of.

---

## 4. The options, one at a time

### 4.1 Supabase — everything right except the one thing that matters

**Free tier** ([pricing](https://supabase.com/pricing)): 500 MB database, 1 GB file storage,
5 GB egress, **unlimited API requests**, 50,000 monthly active users, **limit of 2 active
projects**, 500,000 Edge Function invocations. Compute is "Nano": shared CPU, up to 0.5 GB
memory ([Compute and Disk](https://supabase.com/docs/guides/platform/compute-and-disk)).

**On exceeding**: you are never charged — you are restricted. The
[billing FAQ](https://supabase.com/docs/guides/platform/billing-faq) says "You will be
notified when you exceed the Free Plan quota", after which "service restrictions will apply":
pausing projects, read-only mode, or a `402` on API requests. Specifically on size:

> Free Plan projects enter read-only mode when your database size exceeds 500 MB.

— [Database size](https://supabase.com/docs/guides/platform/database-size)

**Idle behaviour — the disqualifier.** Verified directly at the source:

> Supabase pauses Free Plan projects that show low activity over a 7-day period to save
> server resources.
>
> A Free plan project is considered inactive if it does not receive sufficient user database
> activity over the past week. […] Typically a few user requests to the database each day over
> the previous week is enough to keep the project from being paused.

Restoring is three manual steps in the dashboard — "Click **Resume project** and confirm" —
and "there is a 1-year window to restore the project on the platform from within Supabase
Studio". ([Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing);
the pricing page footnote repeats it: "Free projects are paused after 1 week of inactivity.")

Two caveats on that page, flagged rather than resolved: the doc body says a **1-year** restore
window while the section's own HTML anchor is `#90-day-window-to-restore`, and a
[2024 changelog](https://supabase.com/changelog/27497-paused-free-plan-projects-are-restorable-for-90-days)
says 90 days. **UNVERIFIED:** how long a restore takes — the pausing page lists the steps and
gives no duration; also checked the billing FAQ and compute-and-disk pages. **UNVERIFIED:**
any cold-start latency on an active-but-idle free project; the only "scale to zero" mechanism
in Supabase's docs is scoped to a partner programme
([Supabase for Platforms](https://supabase.com/docs/guides/integrations/supabase-for-platforms):
"Only select customers have access to scale to zero pricing on Nano instances").

**Auth — genuinely excellent, and free at this size.** Built in: "password, magic link,
one-time password (OTP), social login, and single sign-on (SSO)"
([Auth](https://supabase.com/docs/guides/auth)), against 50,000 included MAU. The database
knows who is asking through Row Level Security: `auth.uid()` "Returns the ID of the user
making the request" and returns null when unauthenticated, and requests map to the `anon` and
`authenticated` Postgres roles
([Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)).
An owner-only status change is one `UPDATE` policy `TO authenticated` with
`auth.uid() = '<gal's uuid>'`. Worth knowing if magic links are the plan: Supabase's built-in
email provider is limited to "2 emails per hour"
([Rate limits](https://supabase.com/docs/guides/auth/rate-limits)) — email/password avoids
the dependency.

**One vote per browser.** A `UNIQUE (request_id, browser_id)` constraint. A duplicate insert
comes back as Postgres `23505` at **HTTP 409 Conflict**
([PostgREST error codes](https://supabase.com/docs/guides/api/rest/postgrest-error-codes)),
which the page treats as "already voted"; or `.upsert(..., { onConflict: '...' })` swallows it
([upsert](https://supabase.com/docs/reference/javascript/upsert)). For strangers to insert at
all, both a Postgres grant and an RLS policy must allow it — and note the default is
changing: "Supabase is changing the platform default to revoke these automatic grants so that
exposure becomes opt-in"
([Securing your API](https://supabase.com/docs/guides/api/securing-your-api)), so write the
`grant insert on … to anon` explicitly.

**Cost to the repo: the lowest of any option here — zero.** A CDN build exists:
`<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>`
([Installing](https://supabase.com/docs/reference/javascript/installing)), and the anon key is
documented as publishable: "Safe to expose online: web page, mobile or desktop app […] Anyone
can read it, so it only reaches what Row Level Security allows"
([API keys](https://supabase.com/docs/guides/api/api-keys)). No `package.json`, no build, and
**no serverless functions at all** — the browser talks to Supabase directly and RLS is the
authorization.

**Verdict: the best fit on five of six tests, and a hard fail on the first.** If the 7-day
pause did not exist this document would end here.

---

### 4.2 Neon — the relational option that actually stays reachable

**Free tier** ([Plans](https://neon.com/docs/introduction/plans),
[Free plan limits FAQ](https://neon.com/faqs/free-plan-limits-and-quotas)): 100 projects,
10 branches per project, **0.5 GB storage per project**, **100 CU-hours per project per
month** (enough to run a 0.25 CU compute ~400 hours), autoscaling to 2 CU, **5 GB egress per
project per month**, 6 hours of instant-restore history. No documented row limit.

**On exceeding:**

> when you run out of CU-hours or public network transfer, your compute is suspended until
> the next billing period or until you upgrade. Exceeding the 0.5 GB storage cap causes
> operations that increase storage (inserts, updates, and deletes) to fail until you free
> space or upgrade. […] **None of these limits delete your data.**

— [Neon plans](https://neon.com/docs/introduction/plans)

And: "Neon does not bill overages on the Free plan"
([FAQ](https://neon.com/faqs/free-plan-limits-and-quotas)). A runaway loop takes the write
path offline until the month rolls over; it does not produce a bill.

**Idle behaviour — it sleeps, and it wakes itself. This is the distinction that matters.**

> When your database is inactive, it automatically scales to zero after 5 minutes. […] For
> Neon Free plan users, this setting is fixed. […] Once you query the database again, it
> **reactivates automatically within a few hundred milliseconds**.

— [Scale to zero](https://neon.com/docs/introduction/scale-to-zero)

> Activation generally takes a few hundred milliseconds. However, **if your Neon project has
> been idle for more than 7 days, you may experience a slightly longer activation time.**

— [Compute lifecycle](https://neon.com/docs/introduction/compute-lifecycle)

There is a second, longer-horizon mechanism, and it also self-heals. Branches are archived
when they are "Older than **14 days**" *and* "Have not been accessed for the past **24
hours**" — but:

> **No action is required to unarchive a branch. It happens automatically.**

— [Branch archiving](https://neon.com/docs/guides/branch-archiving)

The only stated cost is "Branches with large amounts of data may experience slightly slower
connection and query times while a branch is being unarchived" — a board of a few hundred rows
is not "large amounts of data".

**UNVERIFIED:** any general policy deleting inactive Free-plan projects. The only first-party
statement found is scoped to **deprecated Azure regions** — "Projects on the Free plan that
have been inactive for 90 days or more are subject to deletion as of October 5, 2026"
([Regions](https://neon.com/docs/introduction/regions),
[Azure regions deprecation](https://neon.com/docs/import/azure-regions-deprecation)). Checked
and found nothing equivalent for AWS regions in
[Manage projects](https://neon.com/docs/manage/projects), the plans page, the free-plan FAQ or
the pricing page. **Choose an AWS region and this does not apply as documented.**

**Answering the actual question:** on day 15 the compute is suspended and the branch is
probably archived. Both wake on the first connection, with no human involved. Nothing is
deleted, nothing needs a dashboard click.

**Auth — this is where Neon loses.** Neon does now ship auth, but:

> The **Managed Better Auth** is in Beta.

— [Neon Auth overview](https://neon.com/docs/auth/overview)

Free tier is "Up to 60k MAU" ([pricing](https://neon.com/pricing)) — comic overkill for one
person, and adopting a Beta auth service, its SDK, its handler routes and its user tables to
gate a single "set status" button is more machinery than the feature. The honest minimum for
Neon is a shared secret in an env var, checked inside the serverless function. **Either way,
auth is something Gal adds, not something the store gives him.**

**One vote per browser.** Plain Postgres:
`INSERT … ON CONFLICT (request_id, browser_id) DO NOTHING` against a `UNIQUE` constraint.
Postgres' own doc: "`ON CONFLICT DO NOTHING` simply avoids inserting a row as its alternative
action" ([INSERT](https://www.postgresql.org/docs/current/sql-insert.html)). No error is
raised — the duplicate comes back as `rowCount === 0`, which the function reads as "already
voted". Without `ON CONFLICT` the same insert raises SQLSTATE `23505`.

**Cost to the repo — higher than it first appears, because of one hard constraint:**

> Your database connection string contains sensitive credentials and **must never be exposed
> in client-side javascript code** (for example, in a browser).

— [Neon JavaScript guide](https://neon.com/docs/guides/javascript)

Anonymous browsers have no database identity, so Postgres has no way to authorize them.
**Every read and every write must go through a serverless function holding `DATABASE_URL`.**
`requests.html` can never talk to Neon directly. The Vercel integration injects the env vars
automatically — `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED`, `PGHOST`/`PGUSER`/etc., plus
legacy `POSTGRES_*` aliases kept "for backwards compatibility with Vercel Postgres templates"
([Vercel native integration](https://neon.com/docs/guides/vercel-native-integration)) — so the
env vars are free. The dependency is not: `@neondatabase/serverless` (or `pg`, or
`postgres.js`) is an npm package, and per §2.1 that is the moment `gal-arcade` gains a
`package.json`, a lockfile, and an install step on every deploy.

One deployment detail: Vercel's Node functions default to `iad1` (Washington DC), so put the
Neon project in a matching AWS region or pay a transatlantic round trip on every query, on top
of the wake-up.

**Verdict: the strongest relational answer, and the right pick if the board must be
Postgres.** It loses to Firestore only on tests 3 and 6 — but it loses on both.

---

### 4.3 Upstash Redis — elegant for the vote, wrong for everything else

**Free tier** ([pricing](https://upstash.com/pricing/redis),
[docs pricing](https://upstash.com/docs/redis/overall/pricing)): 256 MB max data, 10 GB
monthly bandwidth, **500K commands per month**, 10,000 max commands/sec, 10 MB max request
size, **1 database**, persistence yes, REST API yes. No Multi-Zone HA, no uptime SLA, no
encryption at rest on Free.

**Two first-party contradictions, quoted rather than resolved.** The pricing page says 500K
commands/month; the FAQ still asks "What happens when I exceed the request limit on Free
Database (**10.000 requests per day**)?" — answer: "The exceeding commands return exception."
([FAQ](https://upstash.com/docs/redis/help/faq)). And the comparison table says
`Max databases: 1` while the FAQ on the same pricing page says "You can create up to 10
databases for free." Both are far above what this board needs, so neither bites.

**Idle behaviour — the risk is not sleep, it is deletion.** Verified directly:

> Free tier databases are archived after a minimum of 30 days of inactivity. Users get several
> warning emails prior to this operation. **Archival means backing up user data and removing
> the database instance.**

— [Upstash FAQ](https://upstash.com/docs/redis/help/faq)

The data survives as a backup you restore by hand from the console; the **URL and token do
not**. So a fortnight of silence is fine and a quiet couple of months is fatal — and the
recovery is, again, owner-only.

Durability is good: "In Upstash, persistence is always enabled", writes go to "both memory and
the block storage", and "eviction does not result in data loss since the entry is still stored
in the block storage" ([Durable Storage](https://upstash.com/docs/redis/features/durability)).
**UNVERIFIED:** any cold-start figure for the REST endpoint — nothing in the REST API,
getting-started, durability or FAQ pages addresses it. The one documented mechanism is that an
idle key is evicted from RAM and reloaded from block storage on access, unquantified.

**Auth: none.** The Upstash product list ([docs index](https://upstash.com/docs)) is Redis,
Vector, QStash, Workflow, Search, Box, Blob — there is no identity or login product. Owner
login is entirely Gal's to build.

**One vote per browser — this part Redis does beautifully.** `SADD` is atomic and returns 0 on
a duplicate: "Specified members that are already a member of this set are ignored […] the
number of elements that were added to the set, **not including all the elements already
present in the set**" ([SADD](https://redis.io/docs/latest/commands/sadd/)). `SET key value
NX` is the alternative — "Only set the key if it does not already exist", returning a null
reply when it exists ([SET](https://redis.io/docs/latest/commands/set/)).

But the *count* is a separate key. `ZINCRBY` has no duplicate protection at all
([ZINCRBY](https://redis.io/docs/latest/commands/zincrby/)), and MULTI/EXEC cannot help
because it queues a fixed list and cannot branch on `SADD`'s reply. The honest answer is a
four-line Lua script via `EVAL` — `if redis.call('SADD', KEYS[1], ARGV[1]) == 1 then return
redis.call('ZINCRBY', KEYS[2], 1, ARGV[2]) else return -1 end` — which Upstash supports and
executes atomically ([Key-based locking](https://upstash.com/docs/redis/features/key-locking),
[EVALSHA](https://upstash.com/docs/redis/sdks/ts/commands/scripts/evalsha)). **Note what that
means: the constraint lives in a script you wrote, not in the schema.** Nothing structurally
prevents another code path from calling `ZINCRBY` directly.

**Cost to the repo.** Upstash publishes two tokens: "**Standard** token has full privilege
over the database […] **Read Only** token permits access to the read commands only", with
"You can expose the *Read Only* token as it has access to read commands only […] where the
token is exposed to public" ([REST API](https://upstash.com/docs/redis/features/restapi)). So
reads could be a browser `fetch`; writes cannot, and need a function holding the Standard
token. Because the REST API is plain HTTP with a Bearer header, **that function can be
dependency-free** — `@upstash/redis` is optional. **UNVERIFIED:** whether the REST endpoint
sends CORS headers; the REST API page has no CORS section, so browser-direct reads should be
tested before being relied on.

**Where it actually falls down is the data model.** Sorting by votes *and* by date, filtering
by status and by game, with comments per request, means hand-maintaining every index:

| Purpose | Structure | Key |
|---|---|---|
| Request body | HASH | `req:<id>` |
| Sort by votes | ZSET | `board:byvotes` |
| Sort by date | ZSET | `board:bydate` |
| One vote per browser | SET | `req:<id>:voters` |
| Comments | LIST | `req:<id>:comments` |
| Filter by status / game | SET each | `status:new`, `game:cranes`, … |

Creating one request is six commands across six keys, none of it enforced; miss one and the
request is visible in one view and invisible in another. Changing a status is `SREM` + `SADD`
+ `HSET` where SQL is one `UPDATE`. **Redis is the right shape for the vote and the wrong
shape for the record.**

**Verdict: cut.** No auth, a 30-day deletion clock, and a data model that puts every integrity
guarantee in application code.

---

### 4.4 Turso — the free tier is enormous and the inactivity policy is fatal

**Product status first**, because it has moved a lot. Turso Cloud is open to new free signups
and nothing first-party deprecates it, but the company is mid-pivot: a
[Jan 2025 post](https://turso.tech/blog/upcoming-changes-to-the-turso-platform-and-roadmap)
announced going "all-in" on a from-scratch Rust rewrite of SQLite and discontinuing edge
replicas for new users; an [Apr 2026 post](https://turso.tech/blog/turso-cloud-new-generation-private-beta)
put a next-generation Turso Cloud into invite-only private beta while promising the current
platform "will continue"; and the docs now describe
[two engines](https://docs.turso.tech/turso-cloud) — the new "Turso" (in "early preview" on
Cloud) and libSQL, "battle-tested in production on Turso Cloud for years". **The half you
would build on is the legacy half.**

**Free tier** ([pricing](https://turso.tech/pricing)): **100 databases, 5 GB storage, 500
million rows read/month, 10 million rows written/month, 3 GB syncs/month**, 24-hour
point-in-time-recovery window. These are the largest numbers on this page by a wide margin and
completely irrelevant to a board with a hundred rows.

**On exceeding — a hard block, and a nasty one:**

> **Free plan, or paid plan with Overages disabled: Yes. Once you exceed the limit on any
> single metric (storage, rows read, rows written, or syncs), your databases are blocked, even
> if the other metrics are still well under quota.**

— [pricing FAQ](https://turso.tech/pricing); and
[usage and billing](https://docs.turso.tech/help/usage-and-billing): "Any query that exceeds
these limits will result in a failure, indicated by the `BLOCKED` error code."

**Idle behaviour — the disqualifier.** Verified directly at the source:

> Databases get archived after **10 days of inactivity** for users on a **free plan**. You can
> unarchive inactive groups using the API.

— [Unarchive a group (API)](https://docs.turso.tech/api-reference/groups/unarchive) and
[`turso group unarchive`](https://docs.turso.tech/cli/group/unarchive)

Ten days is inside the "quiet for weeks" window, and **the only documented restore paths are
`turso group unarchive <group-name>` and a `POST …/groups/{name}/unarchive` with the owner's
platform token.** Nothing in the docs says a visitor's query wakes it.

There is a direct contradiction with Turso's own marketing:
["No more cold starts!"](https://turso.tech/blog/turso-cloud-debuts-the-new-developer-plan)
(March 2025, announcing this very free plan). It could not be reconciled from first-party
sources — a grep of the complete docs corpus (`docs.turso.tech/llms-full.txt`, ~1 MB) finds
"cold start" once, on an unrelated embedded-sync page, and "scale to zero", "suspend" and
"dormant" zero times. The 10-day archive is the only inactivity policy in the current docs.
**UNVERIFIED:** whether an archived group auto-unarchives on an incoming query, and whether
the 2025 infrastructure change superseded the archive policy leaving the docs stale.

**Auth: none for end users.** Turso has scoped JWT database tokens — "Every token can be
restricted by database, permission level, and expiration"
([Authorization](https://docs.turso.tech/sdk/authorization)) — which authenticate *a client
process to a database*, not *a person*. Permissions are table-and-action level, never row
level ([Fine-grained permissions](https://docs.turso.tech/sdk/authorization/fine-grained-permissions)).
The nearest thing to user auth is JWKS delegation to "your authentication provider (e.g.,
Clerk, Auth0)" ([External auth providers](https://docs.turso.tech/sdk/authorization/jwks)) —
which concedes that you bring the auth provider.

**One vote per browser: works exactly as expected.** `UNIQUE (request_id, browser_id)` is
valid ([CREATE TABLE](https://docs.turso.tech/sql-reference/statements/create-table)) and:

> `DO NOTHING` causes the `INSERT` to silently skip any row that would violate the specified
> constraint. No error is raised and the existing row is left unchanged.

— [Upsert](https://docs.turso.tech/sql-reference/statements/upsert)

Caveats: libSQL is single-writer — "Turso with default configuration only allows one
connection to write at a time"
([Concurrent writes](https://docs.turso.tech/tursodb/concurrent-writes)) — irrelevant at this
traffic; and `busy_timeout`, `journal_mode` and `PRAGMA user_version` are unsupported or
read-only on Cloud ([Limitations](https://docs.turso.tech/cloud/limitations)).

**Cost to the repo — and a security trap.** Turso's HTTP API is
`POST https://[db]-[org].turso.io/v2/pipeline` with a Bearer token and **a body of arbitrary
SQL** ([HTTP quickstart](https://docs.turso.tech/sdk/http/quickstart)). A token shipped in
`requests.html` is public, and there is no row-level scoping to fall back on — so a token that
lets a browser cast a vote also lets anyone cast unlimited votes or fill the table with
garbage. And because the free plan blocks the **entire database** once any single metric is
exceeded, a bored attacker can take the board offline for the rest of the month for free.
**The token must stay server-side.** From a Vercel function the documented route is
`@tursodatabase/serverless` or `@libsql/client/web` — note the plain `@libsql/client` root
import pulls native bindings; "the `/web` import uses the HTTP protocol, which is compatible
with edge and serverless runtimes"
([Vercel integration](https://docs.turso.tech/integrations/vercel)) — with env vars
`TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. That is a `package.json`. Because `/v2/pipeline`
is plain HTTP, a dependency-free `fetch` against it would also work, though Turso's docs do
not present that pattern.

**Verdict: cut.** A 10-day owner-only archive against a board that may go weeks unvisited.

---

### 4.5 Firestore — the one that answers "I log in"

**The Spark (no-cost) plan still exists and new projects can use it.** "Firebase offers two
different pricing plans, the no-cost Spark pricing plan and the pay-as-you-go Blaze pricing
plan"
([Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)),
and the [pricing page](https://firebase.google.com/pricing) offers Spark with "No payment
method needed".

There are now two Firestore editions, and the one that applies by default is Standard: "If you
haven't selected an edition for your Cloud Firestore database, it's automatically classified as
a **Standard edition** with no changes required on your part"
([Firestore editions](https://firebase.google.com/docs/firestore/editions)).

**Free tier (Spark, Standard edition)**
([Firestore quotas](https://firebase.google.com/docs/firestore/quotas),
[Cloud Firestore pricing](https://cloud.google.com/firestore/pricing)):

| Item | Limit |
|---|---|
| Stored data | **1 GiB** |
| Document reads | **50,000 / day** |
| Document writes | **20,000 / day** |
| Document deletes | **20,000 / day** |
| Outbound data transfer | **10 GiB / month** |
| Composite indexes | 200 (without billing enabled) |

"Quotas are applied daily and **reset around midnight Pacific time**." And one rule to
respect: "Cloud Firestore allows **exactly one free database** per project" — use the default
database, never a named one.

**On exceeding:**

> If you exceed the no-cost quota limit in a calendar month for any product, your project's
> usage of that specific product will be shut off for the remainder of that month. […] To use
> that specific product again, you'll need to wait until the next billing cycle or upgrade to
> the Blaze pricing plan.

— [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)

**UNVERIFIED:** that sentence says *calendar month* while the same page and both quota pages
say Firestore's tier "resets every day". No first-party sentence reconciles the two, i.e.
whether blowing 50K reads on a Tuesday kills Firestore for that day or the rest of the month.
Checked: `firebase.google.com/pricing`, `/docs/projects/billing/firebase-pricing-plans`,
`/docs/firestore/quotas`, `cloud.google.com/firestore/pricing`. Read the generic sentence as
the worst case.

**No accidental bill is possible**, which is worth stating because it is the mirror image of
every "we may rate limit" clause elsewhere on this page. Spark has no payment method attached,
and the plan upgrades only on two deliberate actions: "Linking a Cloud Billing account to your
project from within the Google Cloud console" or "Using Google Cloud services (like Pub/Sub or
Cloud Run) or Google Maps APIs in the same project" (same page). Do neither and the failure
mode is a shut-off, not a charge.

**Idle behaviour: nothing sleeps.** There is no instance to spin down — Standard edition is "a
convenient serverless operation model with seamless autoscaling"
([editions](https://firebase.google.com/docs/firestore/editions)) — and the free tier is
open-ended: "**The Free Tier has no end date**, but Google reserves the right to change the
offering […] with 30 days' advance notice"
([Google Cloud free tier](https://docs.cloud.google.com/free/docs/free-cloud-features)).
**A board nobody visits for two weeks works on the day someone does, with no wake-up step.**

Two honest gaps. **UNVERIFIED:** any cold-start figure — Firebase documents cold starts only
for Cloud Functions, never for Firestore, and the only latency factors its own
[best practices](https://firebase.google.com/docs/firestore/best-practices) name are geography
and query shape. **UNVERIFIED:** whether a current inactive-*project* deletion policy exists.
Checked the [Firebase FAQ](https://firebase.google.com/support/faq),
[Learn more about projects](https://firebase.google.com/docs/projects/learn-more), the pricing
plans page, the quotas page and the Google Cloud free-tier page; the only deletion timer
documented anywhere is for *manual* deletion ("The complete deletion of a project requires 30
days"). **This is not "there is no such policy" — it is "I could not confirm either way", and
it is the one thing that could undo the recommendation.**

**Auth — this is why it wins.** Firebase Authentication is in the box and free at this size.
Email/password and social sign-in sit under "Firebase products that are no-cost […] even in
your production apps and even if you have several million users"
([pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)).
Avoid two things on Spark: phone auth ("Verification code SMS messages — **Pay as you go
(Blaze) plan only**") and email-link sign-in (capped at 5 emails/day) —
[Auth limits](https://firebase.google.com/docs/auth/limits). **For one owner logging in,
email/password or Google sign-in is free, forever, with no bolt-on.**

And the database itself knows who is asking:

> If your app uses Firebase Authentication or Google Cloud Identity Platform, the
> `request.auth` variable contains the authentication information for the client requesting
> data.

— [Security rules conditions](https://firebase.google.com/docs/firestore/security/rules-conditions)

Rules are evaluated by Google's service before the write lands; the only documented bypass is
the *server* Admin SDK — "The server client libraries bypass all Cloud Firestore Security
Rules and instead authenticate through Google Application Default Credentials" (same page) —
which is not something a browser can reach.

**One vote per browser — a real, server-enforced write-once row.** Firestore has no `UNIQUE`
declaration, but the substitute is exact and documented. Rules split writes by whether the
document already exists:

> `create` — Applies to writes to nonexistent documents
> `update` — Applies to writes to existing documents
> `delete` — Applies to delete operations

— [Structuring security rules](https://firebase.google.com/docs/firestore/security/rules-structure)

So put the browser id **in the document ID** — `votes/{requestId}_{browserId}` — and write:

```
match /votes/{voteId} {
  allow read:   if true;
  allow create: if resource == null;      // the row must not already exist
  allow update, delete: if false;         // and can never be changed
}
```

`resource == null` as the "does not exist yet" test is Firebase's own idiom — the role-based
access guide uses `return resource == null && …`
([Role-based access](https://firebase.google.com/docs/firestore/solutions/role-based-access)) —
and `resource` vs `request.resource` is documented at
[rules conditions](https://firebase.google.com/docs/firestore/security/rules-conditions).
The rule is load-bearing rather than decorative, because the SDK's `setDoc()` would otherwise
overwrite: "If the document does not exist, it will be created. If the document does exist,
its contents will be overwritten"
([Add data](https://firebase.google.com/docs/firestore/manage-data/add-data)).

The count itself uses `FieldValue.increment(1)`, with transactions available if needed:
"Transactions never partially apply writes"
([Transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)). A single
counter document "can support being incremented once per second"
([Counters](https://firebase.google.com/docs/firestore/solutions/counters)) — four orders of
magnitude above this board's traffic.

**A stronger variant worth considering** — flagged as *my reasoning from documented pieces*,
not a quoted recommendation. Firebase Anonymous Authentication creates "temporary anonymous
accounts" with a real `uid`
([Anonymous auth](https://firebase.google.com/docs/auth/web/anonymous-auth)), free and
unlimited on Spark. Key the vote on `votes/{requestId}_{request.auth.uid}` instead of a
client-chosen id, and add `&& voteId == requestId + '_' + request.auth.uid` to the create rule.
**The id is then issued by Google, not chosen by the browser** — a visitor cannot mint a second
one by editing localStorage, only by provoking a whole new anonymous sign-in. It is a
meaningfully stronger constraint for one extra line of rules.

Either way, be honest about the ceiling: a determined person clearing storage or opening a
private window gets a new identity. This stops accidental double-votes and refresh-spam; it is
not ballot integrity, and **no option on this page can be, because the browser is the only
identity there is.** Firebase's own answer to that next tier is App Check, not rules.

**Sorting.** Single-field sorts need nothing — Firestore automatically creates, per field, two
collection-scope indexes, "one in ascending mode and one in descending mode"
([Index overview](https://firebase.google.com/docs/firestore/query-data/index-overview)). So
"most wanted" (`orderBy('voteCount','desc')`) and "newest" (`orderBy('createdAt','desc')`) work
out of the box. A composite index is needed only when a filter is combined with a different
sort field — "if you need to sort by a different field, you must create a manual index for that
query" — e.g. per-game or per-status views. Creating one is free and needs **no build step**:
"Cloud Firestore returns an error message with a link that you can follow to create the missing
index." You click the link once, in the console.

**Cost to the repo: three `import` lines and a config object. Nothing else.** The SDK is on a
CDN as ES modules ([Web SDK setup alternatives](https://firebase.google.com/docs/web/alt-setup)):

```html
<script type="module">
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js'
import { getAuth }       from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js'
import { getFirestore }  from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js'
</script>
```

The `firebaseConfig` object goes straight into the page, and Firebase says explicitly that this
is fine:

> **Public by design**: API keys for Firebase services only *identify* your Firebase project
> and app to those services. Authorization is handled through Google Cloud IAM permissions,
> Firebase Security Rules, and Firebase App Check.
>
> […] API keys restricted to Firebase services do **not** need to be treated as secrets, and
> it's safe to include them in your code or configuration files.

— [Learn about using and managing API keys](https://firebase.google.com/docs/projects/api-keys)

With the corresponding obligation, from the same page: "Security of your Realtime Database,
Cloud Firestore, and Cloud Storage data is enforced using Firebase Security Rules […] **not**
by keeping your Firebase API key secret." The rules are the security boundary and must be
written accordingly.

**No `package.json`, no build step, no `/api` directory, no env vars, and no serverless
functions at all.** Firestore is the only option researched that needs nothing on the server
side, because the authorization that every other option puts in a function is, here, a rules
file evaluated by Google. **UNVERIFIED:** no first-party byte figures for the CDN module sizes;
the documented mitigation is the per-product partial import shown above.

**Verdict: the recommendation.**

---

### 4.6 Cloudflare D1 — the runner-up, and the cheapest thing to add to this repo

**It does not require moving hosting off Vercel.** D1 has a REST API:
`POST /accounts/{account_id}/d1/database/{database_id}/query`, authenticated with
`Authorization: Bearer $CLOUDFLARE_API_TOKEN`, body `{ "sql": "...", "params": [...] }`
([D1 query API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)).
Because that needs a secret, the call is server-side — but per §2.1, a Vercel function calling
an HTTPS endpoint with built-in `fetch` needs **no `package.json` and no build step**. Two env
vars and one `/api` file is the entire footprint. (The alternative is a tiny Worker with a D1
binding on `*.workers.dev`, called cross-origin from the static page, which keeps the Vercel
repo completely untouched.)

**Free tier** ([D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/)): **5 million rows read/day,
100,000 rows written/day, 5 GB total storage, 10 databases, 500 MB max per database.** On
exceeding: "you will not be able to run queries against D1. D1 API will return errors to your
client indicating that your daily limits have been exceeded." Daily limits reset at 00:00 UTC.

**Idle behaviour: nothing.** There is no inactivity, pause, suspend, archive or deletion policy
documented on the D1 pricing page, the D1 limits page or the Workers limits page. Two weeks of
zero traffic changes nothing. **This is D1's decisive advantage over every hosted-BaaS free
tier above.**

**Auth: bolted on, but the bolt-on is free and unusually clean.** Cloudflare Access free plan
is "$0 forever" with a "50 user limit"
([Access](https://www.cloudflare.com/zero-trust/products/access/)), and it needs no identity
provider at all: "Cloudflare Access can send a one-time PIN (OTP) to approved email addresses
as an alternative to integrating an identity provider"
([One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)),
with deny-by-default policies. An allow-list of one email address is the whole configuration.
**The catch is real though:** Access protects a hostname *on Cloudflare* — the prerequisite is
"An active domain on Cloudflare"
([Self-hosted public app](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/)),
so `gal-arcade.vercel.app` cannot be Access-protected without either putting a custom domain
in front of Vercel or putting the admin surface on a separate Cloudflare hostname.

**One vote per browser: a real constraint.** D1's own guidance names the use case —
"For enforcing uniqueness constraints on a column or columns […] via the `CREATE UNIQUE
INDEX`" ([Use indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/)) — so
`CREATE UNIQUE INDEX ON votes(request_id, voter_id)` and a second vote fails at the storage
engine.

**Abuse control, since anonymous writes are the whole premise:** Turnstile's free plan is
"Free", "Up to 20 widgets", "Unlimited challenges"
([Turnstile plans](https://developers.cloudflare.com/turnstile/plans/)), verified server-side
at `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`, where "Each token can only
be validated once. A replayed token will be rejected with the `timeout-or-duplicate` error
code"
([Server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)).
**UNVERIFIED:** any monthly cap on siteverify requests.

**Verdict: the strongest option that is not Firestore.** It clears tests 1, 2, 4, 5 and 6
outright, and clears test 3 only with a caveat about domains. If Firestore is rejected for any
reason, this is the pick.

*(Related, folded in as a footnote: Cloudflare Durable Objects are now on the free plan —
100,000 requests/day, 5 GB SQLite storage, and "Workers Free plan can only create and access
SQLite-backed Durable Objects"
([DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)). Same
no-sleep story, more machinery than a vote counter needs.)*

---

### 4.7 PocketBase — the best auth story on this page, and nowhere free to run it

PocketBase is a single Go binary with SQLite and a built-in admin UI. Its auth is the best fit
of anything researched: password, OAuth2 and one-time email OTP, plus a `_superusers`
collection where "Superusers can access and modify anything (collection API rules are
ignored)" ([Authentication](https://pocketbase.io/docs/authentication/)). API rules make the
board's exact shape declarative — a rule of `null` means "only by an authorized superuser
(**this is the default**)", an empty string means "anyone will be able to perform the action"
([API rules and filters](https://pocketbase.io/docs/api-rules-and-filters/)). Votes open to
create, locked to update; status locked to superuser. Owner-only status editing is one account
and zero code.

**The problem is where it runs.** It is a long-running stateful process with a local data
directory — "to persist your data you need to mount a volume at `/pb/pb_data`"
([Going to production](https://pocketbase.io/docs/going-to-production/)) — which Vercel cannot
host. So Gal keeps a VM alive. What the obvious hosts document:

| Host | Cost | Sleeps? | Cold start |
|---|---|---|---|
| **Render Free** | $0 | **Yes** — "Render **spins down** a Free web service that goes 15 minutes without receiving any inbound traffic." Also 750 free instance hours/month, after which "Render **suspends** all of your Free web services until the start of the next month." ([Free plan](https://render.com/docs/free)) | "This process takes **about one minute**." |
| **Fly.io** | **No free plan.** `shared-cpu-1x` 256 MB from ~$1.94–2.02/mo plus volumes at "$0.15/GB per month" ([plans](https://fly.io/plans), [pricing](https://fly.io/docs/about/pricing/)) | Optional — `auto_stop_machines = "off"` and it never sleeps ([autostop/autostart](https://fly.io/docs/launch/autostop-autostart/)) | "Usually this takes **well under a second**" ([Machines](https://fly.io/docs/reference/machines/)) |
| **Railway** | Free $0/mo with $1/mo credit; Hobby $5/mo ([pricing](https://railway.com/pricing)) | Yes — "Once a service stops sending packets it is considered inactive after 5 minutes" ([app sleeping](https://docs.railway.com/reference/app-sleeping)) | Unquantified, and pointedly: "The first request sent to a slept service **may return a 502 Bad Gateway response**." |

**Render's free tier is the trap here**: one minute of blank page for the first visitor after a
quiet fortnight is worse than most of the pause policies this document rejects, because it
happens *every* time the board goes quiet for 15 minutes, not once a week.

**Verdict: cut, but note why.** The only version that meets the requirement costs roughly
**$2.10/month on Fly with autostop off** — and buys an ongoing ops surface (a server, TLS,
`pb_data` backups, upgrades) that nothing else on this page has. **UNVERIFIED:** whether
Railway's Free plan permits an always-on service at all; whether Fly's "free trial" carries any
recurring allowance. **UNVERIFIED:** the exact mechanism for declaring a unique index on a
PocketBase collection field — the collections doc did not cover it.

---

### 4.8 A file in the repo rewritten by a GitHub Actions workflow — not viable

The ticket names this option explicitly, so it gets a real answer rather than a dismissal.

**It fails on security before you reach the race conditions.** A browser cannot push to a repo.
The only browser-callable trigger is the repository dispatch endpoint,
`POST /repos/{owner}/{repo}/dispatches`, and "OAuth app tokens and personal access tokens
(classic) need the `repo` scope to use this endpoint"
([Create a repository dispatch event](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event)).
`repo` scope is full read/write on the repository. **Putting that in `requests.html` hands
every visitor commit access to `galmadar/gal-arcade`.** The only way out is a server-side proxy
holding the token — at which point the serverless function this option existed to avoid has
already been built, and it should point at a database instead.

**The one box it ticks is cost:** "GitHub Actions usage is free for self-hosted runners and for
public repositories that use standard GitHub-hosted runners"
([About billing for GitHub Actions](https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions)).

**Concurrent writes race, and the default configuration silently drops votes.** With
`concurrency`, "By default, any existing `pending` job or workflow in the same concurrency
group will be canceled and the new queued job or workflow will take its place"
([Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)).
Two people voting in the same minute: the second cancels the first and the first vote is gone.
`queue: max` raises it to at most 100 pending runs, which converts the problem into a serial
queue where every vote waits behind every other vote's full run.

**Latency is tens of seconds to minutes per vote** — queue, boot a runner, checkout, rewrite,
commit, push, then a Vercel redeploy. Vercel Hobby allows 100 deployments/day and 100
builds/hour ([Limits](https://vercel.com/docs/limits)), so a busy afternoon of voting could
exhaust the day's deployment budget by itself.

**A unique constraint is not expressible at all.** A JSON file in git has no indexes and no
atomicity. The best available is a serialized `concurrency` group plus a job that re-reads
before writing — an application-level lock, capped at 100 pending, which is exactly the
"trusted to the client" failure the ticket rules out.

Two more consequences worth carrying into the decision: **every vote becomes a permanent public
commit** with the voter's text and name in git history forever; and "if a workflow run pushes
code using the repository's `GITHUB_TOKEN`, a new workflow will not run even when the
repository contains a workflow configured to run when `push` events occur"
([Trigger a workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)),
which will bite anyone chaining workflows here.

**Verdict: cut, decisively.**

---

### 4.9 The rest of the field, and why each is out

| Option | Verdict | Why |
|---|---|---|
| **Appwrite Cloud** | **Cut** | "Free projects are paused after 1 week of inactivity" ([pricing](https://appwrite.io/pricing)). Otherwise a good fit — built-in auth, unique indexes, 5 GB bandwidth / 2 GB storage / 750K executions / 75K MAU — but the pause is the same disqualifier as Supabase's. |
| **Nhost** | **Cut** | Same flaw, same period: "Project paused after 1 week of inactivity", and "as long as only 1 is active at any given time" ([pricing](https://nhost.io/pricing)). |
| **MongoDB Atlas M0** | **Cut** | More forgiving but still owner-only: "Atlas automatically pauses Free clusters after **30 days of inactivity** where there are zero connections to the cluster"; "You can resume the cluster at any time" ([free cluster limitations](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)). Resume is a manual dashboard action. No built-in auth either, so it loses on the criterion the ticket calls decisive. |
| **PlanetScale** | **Cut** | **No free tier exists.** Cheapest is $5/month ([pricing](https://planetscale.com/pricing)). Paying for a database with no auth, when D1 is $0 with a unique index, makes no sense here. |
| **Xata** | **Cut** | Product changed to managed Postgres; no free hosted tier — pay-as-you-go after a 14-day trial, with self-hosting the only free route ([pricing](https://xata.io/pricing)). Self-hosting reintroduces PocketBase's problem with none of PocketBase's auth. |
| **Vercel Global Config** (was Edge Config) | **Cut** | Not a database. Hobby gets 1 store, 1 MB max size, and "Write propagation: Up to 10 seconds globally", with the docs warning to "avoid using Global Configs for frequently updated data or data that needs to be accessed immediately after updating" ([limits](https://vercel.com/docs/global-config/global-config-limits)). No constraints, no atomicity — two simultaneous votes are last-write-wins on a blob. |
| **Vercel Blob** | **Cut** | Object storage: no queries, no indexes, no atomic read-modify-write. Overage is harsh: "you will have to wait until 30 days have passed before using Blob storage again" ([usage and pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)). |
| **Convex** | **Close third** | No documented inactivity shutdown — "Idle deployments are defined as those that have not had any function calls for 30 days" appears only as a *billing* concept, "The deployment fee is waived for paused and idle deployments" ([limits](https://docs.convex.dev/production/state/limits)). Free: 1M function calls, 0.5 GB storage, 1 GB egress ([plans](https://www.convex.dev/plans)). But auth is hedged — "Convex Auth is in beta (it isn't complete and may change in backward-incompatible ways)" and Convex steers you to Clerk/Auth0 ([auth](https://docs.convex.dev/auth)) — and it requires a `convex/` function directory with codegen and a deploy step, which ends the no-build-step property outright. **UNVERIFIED:** whether an idle Convex deployment stops serving requests; both pages address only the fee. |
| **Deno Deploy + Deno KV** | **Mention** | Free $0 with 1M requests/month and 1 GiB KV; idle apps scale to zero with no deletion ([pricing](https://deno.com/deploy/pricing)). No built-in auth, and KV atomics are manual next to `CREATE UNIQUE INDEX`. Loses to D1 on both. |
| **InstantDB** | **Cut — shutting down** | Worth recording so nobody proposes it: the pricing page now carries an acquisition notice — existing users should migrate off within 12 months, and "On August 31st, 2027, all cloud apps will shut down." |

---

## 5. The two comparisons that decide it

### 5.1 One vote per browser — how each option expresses it

| Option | Mechanism | Enforced where | On a duplicate |
|---|---|---|---|
| Supabase / Neon | `UNIQUE (request_id, browser_id)`, optionally `ON CONFLICT DO NOTHING` | Schema | Supabase: `23505` at HTTP 409. Neon with `DO NOTHING`: no error, `rowCount === 0` |
| Turso / D1 | `UNIQUE` index, `ON CONFLICT DO NOTHING` | Schema | Silently skipped, no error |
| Firestore | Browser id **is** the document ID; `allow create` + `allow update: if false` | Security rules, server-side | Permission denied |
| Upstash Redis | `SADD` returns 0 on a duplicate; count in a separate key, joined by a Lua script | A script you wrote | `SADD` returns 0 |
| File + Actions | Not expressible | Nowhere | Lost, or serialized behind a queue |

Two observations matter more than the table. First, **the SQL options and Firestore are equally
real** — a rule evaluated by Google before the write lands is no less server-side than a
constraint evaluated by Postgres. Second, **Upstash is the only one where the guarantee lives
in application code**, and the file-in-repo option is the only one with no guarantee at all.

And the shared ceiling, stated once: **`browser_id` is a value the browser sends.** Every option
on this page enforces "one row per (request, id)", not "one vote per human". Clearing storage
mints a new id. The only way to narrow that is to have the *server* issue the id — which
Firestore gets for free via Anonymous Auth (§4.5), and which every other option would need an
`HttpOnly` cookie set by a serverless function to achieve.

### 5.2 The owner's login — built in, or bolted on

Gal chose "I log in", and the map lists *how the board recognises him* as still unspecified.
This is the axis on which the field separates most sharply.

| Option | Auth | What it costs Gal |
|---|---|---|
| **Firestore** | **Built in, free.** Email/password or Google sign-in, unlimited users on Spark; `request.auth.uid` readable in rules, so the database enforces owner-only status changes | One line in a rules file |
| **Supabase** | **Built in, free.** 50k MAU, `auth.uid()` in RLS policies | One RLS policy — but the project is paused half the time |
| PocketBase | **Built in and excellent.** Superusers bypass all API rules; admin UI included | A server to keep alive, ~$2/mo minimum |
| Cloudflare D1 | Bolted on — but Access is free for 50 users and needs no identity provider, just an email allow-list | A domain on Cloudflare |
| Convex | Built in but "Convex Auth is in beta"; steered toward Clerk/Auth0 | A build step |
| **Neon** | Managed Better Auth is **in Beta**; realistically a shared secret in an env var | A function, and code Gal maintains |
| **Turso / Upstash** | **None.** Database tokens authenticate a *process*, not a *person* | Everything |

Note the pattern: **the two options with the best auth story are two of the ones with a 7-day
pause.** Supabase and Appwrite both give exactly what the ticket asks for and then take the
board offline every week it goes quiet. Firestore is the only option that has the auth *and*
stays awake.

---

## 6. Recommendation

**Firebase Firestore, with Firebase Authentication, called directly from the browser.**

The reasoning, in the order the tests were set out in §1:

1. **It is awake on day 15.** No idle state is documented, there is no instance to spin down,
   and the free tier "has no end date". Every option that fails does so by requiring Gal's
   credentials to recover — Supabase at 7 days, Turso at 10, Upstash at 30, Appwrite and Nhost
   at 7, Atlas at 30. Firestore, Neon, D1 and Convex are the survivors.
2. **Strangers can write**, gated by a rule rather than by trust.
3. **The owner, and only the owner, sets status** — and this is where the survivors separate.
   Firestore ships auth free, usable with no build step, enforced *in the database* via
   `request.auth.uid`. Neon's own auth is in Beta. D1's needs a domain on Cloudflare. Convex's
   is in beta and needs a build step. **Gal explicitly chose "I log in"; Firestore is the only
   survivor that makes that a rules line rather than a project.**
4. **One vote per browser** is a server-enforced write-once document, and — uniquely — can be
   keyed on a *server-issued* anonymous uid rather than a client-chosen string.
5. **Sortable by votes and by date** with automatic indexes; a composite index only for filtered
   views, created by clicking a link in an error message.
6. **It costs this repo the least of any option.** Three CDN `import` lines and a config object
   in `requests.html`. No `package.json`, no lockfile, no `node_modules`, no build step, no
   `/api` directory, no env vars, no Marketplace resource, nothing to keep patched.
   **`gal-arcade` stays a static site.** Every other option except Supabase requires at least a
   serverless function, and most require a dependency and therefore a build.

And one thing that is not a test but should be: **an accidental bill is structurally
impossible.** Spark has no payment method attached, and the two documented routes to Blaze are
both deliberate acts. The failure mode is a shut-off, not an invoice.

**If Firestore is rejected**, the order is:

- **Cloudflare D1**, called over its REST API from a dependency-free Vercel function. Never
  sleeps, a real `CREATE UNIQUE INDEX`, a generous free tier, and — because the REST API is
  plain HTTP with a Bearer token — **it also keeps the repo build-free**. Its only real cost is
  that Cloudflare Access needs a domain on Cloudflare, so owner login is either that or a
  hand-rolled shared secret.
- **Neon**, if the board must be relational. It sleeps but wakes itself, which is the property
  that matters. Costs a `package.json` and a function in front of every read and write.

**Do not pick Supabase**, despite it otherwise being the best fit on this page, and **do not
pick the file-in-the-repo option**, which cannot be triggered by a stranger without handing
every visitor commit access to `galmadar/gal-arcade`.

### What this does not decide

- **Moderation** — removing a request that should not be there. Firestore expresses it the same
  way as the status change, but the map lists moderation as unspecified and this document does
  not settle it.
- **Abuse control on anonymous writes.** Rules stop a *duplicate* vote; they do not stop a
  script posting a thousand distinct requests. Firebase's documented answer is App Check, which
  was not researched against this requirement.
- **Whether the board is one collection or several**, and how a request's game is modelled.
  Domain work, not vendor selection.

---

## 7. Everything this document could not verify

Listed in one place, because a gap mentioned only in passing is a gap that gets forgotten. None
of these were filled from memory.

| # | Unverified | Why it matters |
|---|---|---|
| 1 | **Whether Firebase has a current inactive-*project* deletion policy.** Not found either way. Checked the Firebase FAQ, Learn more about projects, pricing plans, quotas, and the Google Cloud free-tier page. | **The one that could undo the recommendation.** It is "could not confirm either way", not "there is no such policy". |
| 2 | Whether a Spark daily-quota overrun disables Firestore for that **day** or the **calendar month**. The generic sentence says month; the quota pages say the tier resets daily. | Worst case is a month of read-only board. Treat the generic sentence as binding. |
| 3 | Any Firestore cold-start figure. Firebase documents cold starts only for Cloud Functions. | Probably genuinely absent rather than undocumented, but not asserted. |
| 4 | First-party byte sizes for the Firebase CDN modules. | Three extra module requests on a page that today has zero dependencies. |
| 5 | A *quotable* first-party sentence saying Firestore has no unique constraints. | The substitute mechanism is fully documented; the absence statement is not. |
| 6 | The Vercel Marketplace free-plan limits for Neon, Upstash or Supabase. No vercel.com page enumerates them; the blog asserts parity with going direct. | All numbers here are the vendor's own, not Vercel-mediated. |
| 7 | Any general Neon policy deleting inactive Free projects outside the deprecated **Azure** regions. | Choose an AWS region and the documented policy does not apply. |
| 8 | A numeric unarchive latency for a Neon branch, and the Neon Data API's GA/beta status. | "Slightly slower for large branches" is the only figure published. |
| 9 | How long a Supabase restore takes; and the 1-year vs 90-day restore-window contradiction (doc body vs its own HTML anchor vs a 2024 changelog). | Academic if Supabase is not chosen. |
| 10 | Any Supabase cold-start figure for an active-but-idle free project. | Only the partner-programme "scale to zero" was found. |
| 11 | Whether an archived **Turso** group auto-unarchives on an incoming query, and whether the March 2025 "No more cold starts!" post superseded the 10-day archive policy. Blog and docs directly contradict; a grep of the full docs corpus finds no reconciliation. | Would need Turso support to settle before building on the free plan. |
| 12 | **Upstash**, five separate silences or self-contradictions: cold start on the REST endpoint; CORS headers; 500K/month vs 10K/day; 1 free database vs 10; whether "deleted after 3 days" applies to normal free databases or only unclaimed instant-provisioned ones. | Enough on its own to distrust the numbers. |
| 13 | Whether an idle **Convex** deployment stops serving requests, or merely stops being billed. | Both pages address only the fee. |
| 14 | Whether **Railway's** Free plan permits an always-on service; the terms of **Fly.io's** free trial. | Only matters for the PocketBase route. |
| 15 | The exact mechanism for declaring a unique index on a **PocketBase** collection field. | Only matters for the PocketBase route. |
| 16 | Any monthly cap on **Turnstile** siteverify requests. | Plans page states widget count and "Unlimited challenges" only. |
| 17 | How long a Vercel Git-integration deployment of a static site takes. | Only matters for the file-in-repo option, which is cut anyway. |

---

## 8. Sources

**Vercel** — [Hobby plan](https://vercel.com/docs/plans/hobby) ·
[Functions limits](https://vercel.com/docs/functions/limitations) ·
[Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js) ·
[Limits](https://vercel.com/docs/limits) ·
[Fair use](https://vercel.com/docs/limits/fair-use-guidelines) ·
[Storage overview](https://vercel.com/docs/storage) ·
[Marketplace storage](https://vercel.com/docs/marketplace-storage) ·
[Postgres](https://vercel.com/docs/postgres) · [Redis](https://vercel.com/docs/redis) ·
[Global Config limits](https://vercel.com/docs/global-config/global-config-limits) ·
[Blob usage and pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing) ·
[Why was my deployment paused?](https://vercel.com/kb/guide/why-is-my-account-deployment-blocked) ·
[Introducing the Vercel Marketplace](https://vercel.com/blog/introducing-the-vercel-marketplace)

**Firebase / Google Cloud** — [Pricing](https://firebase.google.com/pricing) ·
[Pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans) ·
[Firestore quotas](https://firebase.google.com/docs/firestore/quotas) ·
[Firestore pricing](https://cloud.google.com/firestore/pricing) ·
[Firestore editions](https://firebase.google.com/docs/firestore/editions) ·
[API keys](https://firebase.google.com/docs/projects/api-keys) ·
[Rules structure](https://firebase.google.com/docs/firestore/security/rules-structure) ·
[Rules conditions](https://firebase.google.com/docs/firestore/security/rules-conditions) ·
[Role-based access](https://firebase.google.com/docs/firestore/solutions/role-based-access) ·
[Transactions](https://firebase.google.com/docs/firestore/manage-data/transactions) ·
[Counters](https://firebase.google.com/docs/firestore/solutions/counters) ·
[Add data](https://firebase.google.com/docs/firestore/manage-data/add-data) ·
[Index overview](https://firebase.google.com/docs/firestore/query-data/index-overview) ·
[Web SDK alt setup](https://firebase.google.com/docs/web/alt-setup) ·
[Auth](https://firebase.google.com/docs/auth) ·
[Auth limits](https://firebase.google.com/docs/auth/limits) ·
[Anonymous auth](https://firebase.google.com/docs/auth/web/anonymous-auth) ·
[Google Cloud free tier](https://docs.cloud.google.com/free/docs/free-cloud-features)

**Supabase** — [Pricing](https://supabase.com/pricing) ·
[Project pausing](https://supabase.com/docs/guides/platform/free-project-pausing) ·
[Billing FAQ](https://supabase.com/docs/guides/platform/billing-faq) ·
[Database size](https://supabase.com/docs/guides/platform/database-size) ·
[Compute and disk](https://supabase.com/docs/guides/platform/compute-and-disk) ·
[Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) ·
[API keys](https://supabase.com/docs/guides/api/api-keys) ·
[Securing your API](https://supabase.com/docs/guides/api/securing-your-api) ·
[PostgREST error codes](https://supabase.com/docs/guides/api/rest/postgrest-error-codes) ·
[Installing](https://supabase.com/docs/reference/javascript/installing) ·
[Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)

**Neon** — [Plans](https://neon.com/docs/introduction/plans) ·
[Pricing](https://neon.com/pricing) ·
[Free plan limits FAQ](https://neon.com/faqs/free-plan-limits-and-quotas) ·
[Scale to zero](https://neon.com/docs/introduction/scale-to-zero) ·
[Compute lifecycle](https://neon.com/docs/introduction/compute-lifecycle) ·
[Branch archiving](https://neon.com/docs/guides/branch-archiving) ·
[Connection latency](https://neon.com/docs/connect/connection-latency) ·
[JavaScript guide](https://neon.com/docs/guides/javascript) ·
[Serverless driver](https://neon.com/docs/serverless/serverless-driver) ·
[Vercel native integration](https://neon.com/docs/guides/vercel-native-integration) ·
[Neon Auth](https://neon.com/docs/auth/overview) ·
[Regions](https://neon.com/docs/introduction/regions) ·
[PostgreSQL INSERT](https://www.postgresql.org/docs/current/sql-insert.html)

**Upstash** — [Redis pricing](https://upstash.com/pricing/redis) ·
[Pricing docs](https://upstash.com/docs/redis/overall/pricing) ·
[FAQ](https://upstash.com/docs/redis/help/faq) ·
[Durability](https://upstash.com/docs/redis/features/durability) ·
[REST API](https://upstash.com/docs/redis/features/restapi) ·
[Key locking](https://upstash.com/docs/redis/features/key-locking) ·
[SADD](https://redis.io/docs/latest/commands/sadd/) ·
[SET](https://redis.io/docs/latest/commands/set/) ·
[ZINCRBY](https://redis.io/docs/latest/commands/zincrby/)

**Turso** — [Pricing](https://turso.tech/pricing) ·
[Usage and billing](https://docs.turso.tech/help/usage-and-billing) ·
[Turso Cloud](https://docs.turso.tech/turso-cloud) ·
[Group unarchive (CLI)](https://docs.turso.tech/cli/group/unarchive) ·
[Group unarchive (API)](https://docs.turso.tech/api-reference/groups/unarchive) ·
[Authorization](https://docs.turso.tech/sdk/authorization) ·
[Upsert](https://docs.turso.tech/sql-reference/statements/upsert) ·
[Cloud limitations](https://docs.turso.tech/cloud/limitations) ·
[Vercel integration](https://docs.turso.tech/integrations/vercel) ·
[HTTP quickstart](https://docs.turso.tech/sdk/http/quickstart) ·
[Roadmap post](https://turso.tech/blog/upcoming-changes-to-the-turso-platform-and-roadmap) ·
[Developer plan post](https://turso.tech/blog/turso-cloud-debuts-the-new-developer-plan)

**Cloudflare** — [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) ·
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/) ·
[D1 query API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/) ·
[Use indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/) ·
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) ·
[Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) ·
[Access](https://www.cloudflare.com/zero-trust/products/access/) ·
[One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/) ·
[Turnstile plans](https://developers.cloudflare.com/turnstile/plans/) ·
[Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

**Others** — [PocketBase production](https://pocketbase.io/docs/going-to-production/) ·
[PocketBase auth](https://pocketbase.io/docs/authentication/) ·
[PocketBase API rules](https://pocketbase.io/docs/api-rules-and-filters/) ·
[Render free plan](https://render.com/docs/free) ·
[Fly.io pricing](https://fly.io/docs/about/pricing/) ·
[Fly autostop/autostart](https://fly.io/docs/launch/autostop-autostart/) ·
[Railway app sleeping](https://docs.railway.com/reference/app-sleeping) ·
[Appwrite pricing](https://appwrite.io/pricing) · [Nhost pricing](https://nhost.io/pricing) ·
[Atlas free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/) ·
[PlanetScale pricing](https://planetscale.com/pricing) · [Xata pricing](https://xata.io/pricing) ·
[Convex plans](https://www.convex.dev/plans) ·
[Convex limits](https://docs.convex.dev/production/state/limits) ·
[Convex auth](https://docs.convex.dev/auth) ·
[Deno Deploy pricing](https://deno.com/deploy/pricing) ·
[GitHub Actions billing](https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions) ·
[Actions limits](https://docs.github.com/en/actions/reference/limits) ·
[Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) ·
[Repository dispatch](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event)

