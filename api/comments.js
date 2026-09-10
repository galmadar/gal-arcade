import { HttpError, LIMITS, body, db, handle, only, requestId, text } from './_db.js';

export default async function handler(req, res) {
  if (!only(req, res, ['POST'])) return;

  await handle(res, async () => {
    const sent = body(req);
    const id = requestId(sent.request_id);
    const author = text(sent.author, 'Your name', LIMITS.author);
    const said = text(sent.body, 'A note', LIMITS.comment);

    const sql = db();
    const [row] = await sql`
      insert into comments (request_id, author, body)
      values (${id}, ${author}, ${said})
      returning id, request_id, author, body, created_at
    `;
    if (!row) throw new HttpError(404, 'That request is gone.');

    res.status(201).json({ comment: row });
  });
}
