-- CreateIndex
CREATE INDEX "client_sessions_accessTokenHash_idx" ON "client_sessions"("accessTokenHash");

-- CreateIndex
CREATE INDEX "client_sessions_refreshTokenHash_idx" ON "client_sessions"("refreshTokenHash");
