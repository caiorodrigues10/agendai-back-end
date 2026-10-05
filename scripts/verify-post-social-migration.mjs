import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

// Run with an isolated PGlite installation; no connection to the application DB.
// node scripts/verify-post-social-migration.mjs <path-to-pglite/dist/index.js>
const modulePath = process.argv[2];
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const salon = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const post = '00000000-0000-0000-0000-000000000003';
const user = '00000000-0000-0000-0000-000000000004';
const client = '00000000-0000-0000-0000-000000000005';
const comment = '00000000-0000-0000-0000-000000000006';
const tag = '00000000-0000-0000-0000-000000000007';

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE app_test;
    CREATE TABLE users (id uuid PRIMARY KEY);
    CREATE TABLE client_identities (id uuid PRIMARY KEY);
    CREATE TABLE barbershops (id uuid PRIMARY KEY);
    CREATE TABLE feed_posts (id uuid PRIMARY KEY, "barbershopId" uuid REFERENCES barbershops(id));
    INSERT INTO users VALUES ('${user}'); INSERT INTO client_identities VALUES ('${client}');
    INSERT INTO barbershops VALUES ('${salon}'), ('${other}');
    INSERT INTO feed_posts VALUES ('${post}', '${salon}');
  `);
  await db.exec(await readFile('prisma/migrations/20261002000004_add_post_social_interactions/migration.sql', 'utf8'));
  const denied = await db.query("SELECT has_table_privilege('anon', 'post_comments', 'SELECT') AS anon, has_table_privilege('authenticated', 'post_tags', 'INSERT') AS authenticated");
  assert.deepEqual(denied.rows[0], { anon: false, authenticated: false });
  await db.query('INSERT INTO post_comments (id,"postId","clientIdentityId",content) VALUES ($1,$2,$3,$4)', [comment, post, client, 'Gostei!']);
  await assert.rejects(db.query('INSERT INTO post_comments (id,"postId",content) VALUES ($1,$2,$3)', ['00000000-0000-0000-0000-000000000008', post, '   ']), /check constraint/);
  await assert.rejects(db.query('INSERT INTO post_comments (id,"postId","authorId","clientIdentityId",content) VALUES ($1,$2,$3,$4,$5)', ['00000000-0000-0000-0000-000000000009', post, user, client, 'Oi']), /check constraint/);
  await db.query('INSERT INTO post_tags (id,"postId","barbershopId","requestedById") VALUES ($1,$2,$3,$4)', [tag, post, other, user]);
  await assert.rejects(db.query('INSERT INTO post_tags (id,"postId","barbershopId") VALUES ($1,$2,$3)', ['00000000-0000-0000-0000-000000000010', post, other]), /unique constraint/);

  await db.exec('GRANT USAGE ON SCHEMA public TO app_test; GRANT SELECT ON feed_posts TO app_test; GRANT SELECT, INSERT, UPDATE, DELETE ON post_comments, post_tags TO app_test; SET ROLE app_test;');
  await db.query("SELECT set_config('app.current_barbershop_id', $1, false)", [other]);
  assert.equal((await db.query('SELECT * FROM post_comments')).rows.length, 0);
  assert.equal((await db.query('SELECT * FROM post_tags')).rows.length, 1);
  await assert.rejects(db.query('INSERT INTO post_comments (id,"postId",content) VALUES ($1,$2,$3)', ['00000000-0000-0000-0000-000000000011', post, 'Outro salão']), /row-level security/);
  await db.query("SELECT set_config('app.current_barbershop_id', $1, false)", [salon]);
  assert.equal((await db.query('SELECT * FROM post_comments')).rows.length, 1);
  assert.equal((await db.query('SELECT * FROM post_tags')).rows.length, 0);
  await db.exec('RESET ROLE');

  await db.query('DELETE FROM client_identities WHERE id=$1', [client]);
  assert.equal((await db.query('SELECT "clientIdentityId" FROM post_comments')).rows[0].clientIdentityId, null);
  await db.query('DELETE FROM feed_posts WHERE id=$1', [post]);
  assert.equal((await db.query('SELECT * FROM post_comments')).rows.length, 0);
  assert.equal((await db.query('SELECT * FROM post_tags')).rows.length, 0);
  console.log('Post social migration OK: SQL, constraints, foreign keys, cascades, uniqueness, Data API grants and tenant RLS verified in isolated PostgreSQL/PGlite.');
} finally {
  await db.close();
}
