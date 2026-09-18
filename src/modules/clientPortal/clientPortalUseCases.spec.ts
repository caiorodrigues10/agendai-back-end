/// <reference types="vitest/globals" />
import { ClientPortalRepositoryInstance } from "./clientPortalUseCases";

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    clientSession: { findMany: vi.fn() },
    clientSalonLink: { findUnique: vi.fn() },
  },
}));

function createRepo() {
  return {
    findIdentityById: vi.fn(),
    findLinkById: vi.fn(),
    revokeSalonLink: vi.fn(),
    revokeSession: vi.fn(),
    revokeAllSessions: vi.fn(),
    getPortalDashboard: vi.fn(),
  };
}

describe("ClientPortalRepositoryInstance client identity", () => {
  let repo: ReturnType<typeof createRepo>;
  let useCases: ClientPortalRepositoryInstance;

  beforeEach(() => {
    repo = createRepo();
    useCases = new ClientPortalRepositoryInstance(repo as any);
  });

  it("getMe returns identity", async () => {
    const identity = { id: "id-1", name: "Ana", phone: "11999999999", phoneVerified: true };
    repo.findIdentityById.mockResolvedValue(identity);

    await expect(useCases.getMe("id-1")).resolves.toEqual(identity);
    expect(repo.findIdentityById).toHaveBeenCalledWith("id-1");
  });

  it("getMe throws 404 when missing", async () => {
    repo.findIdentityById.mockResolvedValue(null);

    await expect(useCases.getMe("missing")).rejects.toMatchObject({
      message: "Identidade não encontrada",
      statusCode: 404,
    });
  });

  it("logout revokes only the current session", async () => {
    repo.revokeSession.mockResolvedValue({});
    await useCases.logout("session-1");
    expect(repo.revokeSession).toHaveBeenCalledWith("session-1");
    expect(repo.revokeAllSessions).not.toHaveBeenCalled();
  });

  it("logoutAll revokes every session for the identity", async () => {
    repo.revokeAllSessions.mockResolvedValue({ count: 2 });
    await useCases.logoutAll("id-1");
    expect(repo.revokeAllSessions).toHaveBeenCalledWith("id-1");
  });
});

describe("revokeOwnLink", () => {
  let repo: ReturnType<typeof createRepo>;
  let useCases: ClientPortalRepositoryInstance;

  beforeEach(() => {
    repo = createRepo();
    useCases = new ClientPortalRepositoryInstance(repo as any);
  });

  it("revokes a confirmed link owned by the identity", async () => {
    repo.findLinkById.mockResolvedValue({
      id: "link-1",
      identityId: "id-1",
      status: "CONFIRMED",
    });
    repo.revokeSalonLink.mockResolvedValue({ id: "link-1", status: "REVOKED" });

    await expect(useCases.revokeOwnLink("id-1", "link-1")).resolves.toMatchObject({
      status: "REVOKED",
    });
    expect(repo.revokeSalonLink).toHaveBeenCalledWith("link-1");
  });

  it("does not revoke another identity's link", async () => {
    repo.findLinkById.mockResolvedValue({
      id: "link-2",
      identityId: "other-id",
      status: "CONFIRMED",
    });

    await expect(useCases.revokeOwnLink("id-1", "link-2")).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(repo.revokeSalonLink).not.toHaveBeenCalled();
  });

  it("rejects an already revoked link", async () => {
    repo.findLinkById.mockResolvedValue({
      id: "link-1",
      identityId: "id-1",
      status: "REVOKED",
    });

    await expect(useCases.revokeOwnLink("id-1", "link-1")).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(repo.revokeSalonLink).not.toHaveBeenCalled();
  });
});
