/// <reference types="vitest/globals" />
import { ReputationUseCases } from "./reputationUseCases";
import { AppError } from "@/shared/errors/AppError";

const OWNER_SHOP1 = { id: "u-1", role: "OWNER", barbershopId: "shop-1" };
const OWNER_SHOP2 = { id: "u-2", role: "OWNER", barbershopId: "shop-2" };
const MASTER = { id: "u-m", role: "MASTER_ADMIN" };

let repo: {
  getReputation: ReturnType<typeof vi.fn>;
  upsertReputation: ReturnType<typeof vi.fn>;
  getReviewsForBarbershop: ReturnType<typeof vi.fn>;
  getReviewById: ReturnType<typeof vi.fn>;
  getReviewResponse: ReturnType<typeof vi.fn>;
  createReviewResponse: ReturnType<typeof vi.fn>;
};
let useCases: ReputationUseCases;

beforeEach(() => {
  repo = {
    getReputation: vi.fn(),
    upsertReputation: vi.fn(),
    getReviewsForBarbershop: vi.fn().mockResolvedValue([]),
    getReviewById: vi.fn(),
    getReviewResponse: vi.fn(),
    createReviewResponse: vi.fn(),
  };
  useCases = new ReputationUseCases(repo as any);
});

describe("Isolamento de tenant (IDOR) — reputação", () => {
  const stored = {
    id: "rep-1",
    barbershopId: "shop-1",
    avgRating: 4.8,
    totalReviews: 120,
    npsScore: 72,
    sentimentPositive: 100,
    sentimentNeutral: 12,
    sentimentNegative: 8,
    computedAt: new Date(),
    updatedAt: new Date(),
  };

  it("lê a reputação do próprio salão", async () => {
    repo.getReputation.mockResolvedValue(stored);
    await expect(useCases.getReputation("shop-1", OWNER_SHOP1)).resolves.toMatchObject({ barbershopId: "shop-1" });
  });

  it("ler reputação de outro salão é 403 e não consulta o banco", async () => {
    await expect(useCases.getReputation("shop-1", OWNER_SHOP2)).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.getReputation).not.toHaveBeenCalled();
  });

  it("MASTER_ADMIN pode ler a reputação de qualquer salão", async () => {
    repo.getReputation.mockResolvedValue(stored);
    await expect(useCases.getReputation("shop-1", MASTER)).resolves.toMatchObject({ avgRating: 4.8 });
  });

  it("recomputar reputação de outro salão é 403", async () => {
    await expect(useCases.computeReputation("shop-1", OWNER_SHOP2)).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.upsertReputation).not.toHaveBeenCalled();
  });

  it("responder review do próprio salão funciona", async () => {
    repo.getReviewById.mockResolvedValue({ id: "rev-1", barbershopId: "shop-1", rating: 5, comment: "ok" });
    repo.createReviewResponse.mockResolvedValue({ id: "res-1", reviewId: "rev-1" });
    await expect(
      useCases.respondToReview("rev-1", "u-1", { content: "obrigado" } as any, OWNER_SHOP1),
    ).resolves.toMatchObject({ id: "res-1" });
  });

  it("responder review de outro salão é 403 e não grava", async () => {
    repo.getReviewById.mockResolvedValue({ id: "rev-1", barbershopId: "shop-1", rating: 5, comment: "ok" });
    await expect(
      useCases.respondToReview("rev-1", "u-2", { content: "hack" } as any, OWNER_SHOP2),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.createReviewResponse).not.toHaveBeenCalled();
  });

  it("ler resposta de review de outro salão é 403", async () => {
    repo.getReviewById.mockResolvedValue({ id: "rev-1", barbershopId: "shop-1", rating: 5, comment: "ok" });
    repo.getReviewResponse.mockResolvedValue({ id: "res-1", reviewId: "rev-1", content: "obrigado" });
    await expect(useCases.getReviewResponse("rev-1", OWNER_SHOP2)).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.getReviewResponse).not.toHaveBeenCalled();
  });

  it("review inexistente continua 404", async () => {
    repo.getReviewById.mockResolvedValue(null);
    await expect(
      useCases.respondToReview("nope", "u-1", { content: "x" } as any, OWNER_SHOP1),
    ).rejects.toBeInstanceOf(AppError);
    await expect(useCases.getReviewResponse("nope", OWNER_SHOP1)).rejects.toMatchObject({ statusCode: 404 });
  });
});
