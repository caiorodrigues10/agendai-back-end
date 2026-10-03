CREATE TABLE "post_comments" (
  "id" UUID NOT NULL,
  "postId" UUID NOT NULL,
  "authorId" UUID,
  "clientIdentityId" UUID,
  "content" VARCHAR(500) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "post_comments_content_check" CHECK (char_length(btrim("content")) BETWEEN 1 AND 500),
  CONSTRAINT "post_comments_actor_check" CHECK ("authorId" IS NULL OR "clientIdentityId" IS NULL),
  CONSTRAINT "post_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "feed_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "post_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "post_comments_clientIdentityId_fkey" FOREIGN KEY ("clientIdentityId") REFERENCES "client_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "post_comments_postId_createdAt_id_idx" ON "post_comments"("postId", "createdAt", "id");
CREATE INDEX "post_comments_authorId_idx" ON "post_comments"("authorId");
CREATE INDEX "post_comments_clientIdentityId_idx" ON "post_comments"("clientIdentityId");

CREATE TABLE "post_tags" (
  "id" UUID NOT NULL,
  "postId" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "requestedById" UUID,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_tags_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "post_tags_postId_fkey" FOREIGN KEY ("postId") REFERENCES "feed_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "post_tags_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "post_tags_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "post_tags_postId_barbershopId_key" ON "post_tags"("postId", "barbershopId");
CREATE INDEX "post_tags_barbershopId_approvedAt_createdAt_idx" ON "post_tags"("barbershopId", "approvedAt", "createdAt");
CREATE INDEX "post_tags_requestedById_idx" ON "post_tags"("requestedById");

-- Access is exclusively through Fastify, which checks published posts and actors.
ALTER TABLE "post_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "post_tags" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "post_comments_tenant" ON "post_comments" FOR ALL USING (
  COALESCE(current_setting('app.current_barbershop_id', true), '') = '' OR
  EXISTS (SELECT 1 FROM "feed_posts" p WHERE p.id = "post_comments"."postId" AND p."barbershopId"::text = current_setting('app.current_barbershop_id', true))
) WITH CHECK (
  COALESCE(current_setting('app.current_barbershop_id', true), '') = '' OR
  EXISTS (SELECT 1 FROM "feed_posts" p WHERE p.id = "post_comments"."postId" AND p."barbershopId"::text = current_setting('app.current_barbershop_id', true))
);
CREATE POLICY "post_tags_tenant" ON "post_tags" FOR ALL USING (
  COALESCE(current_setting('app.current_barbershop_id', true), '') = '' OR
  "barbershopId"::text = current_setting('app.current_barbershop_id', true)
) WITH CHECK (
  COALESCE(current_setting('app.current_barbershop_id', true), '') = '' OR
  "barbershopId"::text = current_setting('app.current_barbershop_id', true)
);
REVOKE ALL ON "post_comments", "post_tags" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "post_comments", "post_tags" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "post_comments", "post_tags" FROM authenticated;
  END IF;
END $$;
