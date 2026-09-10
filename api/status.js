import { HttpError, STATUSES, body, db, handle, isAdmin, oneOf, only, requestId } from './_db.js';

export default async function handler(req, res) {
  if (!only(req, res, ['POST'])) return;

  // Checked before anything reads the request or opens the database: a wrong
  // password must not be able to make this function do work.
  if (!isAdmin(req)) {
    res.status(401).json({ error: 'Only Gal can move a request.' });
    return;
  }

  await handle(res, async () => {
    const sent = body(req);
    const id = requestId(sent.request_id);
    const status = oneOf(sent.status, STATUSES, 'status');

    const sql = db();
    const [row] = await sql`
      update requests set status = ${status} where id = ${id}
      returning id, status
    `;
    if (!row) throw new HttpError(404, 'That request is gone.');

    res.status(200).json({ request: row });
  });
}
