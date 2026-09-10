import { LIMITS, body, db, handle, only, requestId, text } from './_db.js';

export default async function handler(req, res) {
  if (!only(req, res, ['POST', 'DELETE'])) return;
  await handle(res, () => (req.method === 'POST' ? add(req, res) : drop(req, res)));
}

async function add(req, res) {
  const sent = body(req);
  const id = requestId(sent.request_id);
  const browser = text(sent.browser_id, 'A browser id', LIMITS.browser);

  const sql = db();
  // The unique index decides; a repeat click is a no-op rather than an error.
  await sql`
    insert into votes (request_id, browser_id)
    values (${id}, ${browser})
    on conflict (request_id, browser_id) do nothing
  `;

  res.status(200).json({ votes: await count(sql, id), voted: true });
}

async function drop(req, res) {
  const id = requestId(req.query.request);
  const browser = text(req.query.browser, 'A browser id', LIMITS.browser);

  const sql = db();
  await sql`delete from votes where request_id = ${id} and browser_id = ${browser}`;

  res.status(200).json({ votes: await count(sql, id), voted: false });
}

async function count(sql, id) {
  const [row] = await sql`select count(*)::int as votes from votes where request_id = ${id}`;
  return row.votes;
}
