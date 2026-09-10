-- The board's whole record. Run once against the Neon branch, by hand:
--   psql "$DATABASE_URL" -f db/schema.sql

create table if not exists requests (
  id         bigint generated always as identity primary key,
  game       text not null check (length(game) between 1 and 40),
  kind       text not null check (kind in ('broken', 'wanted')),
  body       text not null check (length(body) between 1 and 2000),
  author     text not null check (length(author) between 1 and 60),
  status     text not null default 'new'
             check (status in ('new', 'in review', 'develop', 'done in production', 'declined')),
  created_at timestamptz not null default now()
);

create table if not exists votes (
  id         bigint generated always as identity primary key,
  request_id bigint not null references requests (id) on delete cascade,
  browser_id text not null check (length(browser_id) between 8 and 100),
  created_at timestamptz not null default now()
);

-- One vote per browser, decided here rather than in the page: a second vote is
-- a database error, not something the client is trusted to avoid.
create unique index if not exists votes_one_per_browser on votes (request_id, browser_id);

create table if not exists comments (
  id         bigint generated always as identity primary key,
  request_id bigint not null references requests (id) on delete cascade,
  author     text not null check (length(author) between 1 and 60),
  body       text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists comments_by_request on comments (request_id, created_at);
create index if not exists requests_by_date on requests (created_at desc);
