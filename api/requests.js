import { GAMES, KINDS, LIMITS, body, db, handle, oneOf, only, text } from './_db.js';

export default async function handler(req, res) {
  if (!only(req, res, ['GET', 'POST'])) return;
  await handle(res, () => (req.method === 'GET' ? list(req, res) : create(req, res)));
}

async function list(req, res) {
  const sql = db();
  const browser = String(req.query.browser || '').slice(0, LIMITS.browser);
  const order = req.query.sort === 'new' ? 'r.created_at desc' : 'votes desc, r.created_at desc';

  const rows = await sql`
    select
      r.id, r.game, r.kind, r.body, r.author, r.status, r.created_at,
      (select count(*) from votes v where v.request_id = r.id)::int as votes,
      exists (select 1 from votes v where v.request_id = r.id and v.browser_id = ${browser}) as voted,
      coalesce(
        (select json_agg(json_build_object(
           'id', c.id, 'author', c.author, 'body', c.body, 'created_at', c.created_at
         ) order by c.created_at)
         from comments c where c.request_id = r.id),
        '[]'::json
      ) as comments
    from requests r
    order by ${sql.unsafe(order)}
  `;

  // The board is the record and changes on every vote, so nothing may serve a copy of it.
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ requests: rows });
}

async function create(req, res) {
  const sent = body(req);
  const game = oneOf(text(sent.game, 'A game', LIMITS.game), GAMES, 'game');
  const kind = oneOf(sent.kind, KINDS, 'kind');
  const said = text(sent.body, 'What happened', LIMITS.body);
  const author = text(sent.author, 'Your name', LIMITS.author);

  const sql = db();
  const [row] = await sql`
    insert into requests (game, kind, body, author)
    values (${game}, ${kind}, ${said}, ${author})
    returning id, game, kind, body, author, status, created_at
  `;

  res.status(201).json({ request: { ...row, votes: 0, voted: false, comments: [] } });
}
