/// <reference types="vitest/globals" />
import {
  GetSalonTrafficReportUseCase,
  type SalonTrafficQuery,
} from "./GetSalonTrafficReportUseCase";
import type {
  ISalonTrafficReportRepository,
  SalonTrafficDailyRow,
  SalonTrafficHourlyRow,
  SalonTrafficOriginRow,
  SalonTrafficSectionRow,
} from "../ports/ISalonTrafficReportRepository";

const SHOP_UUID = "0f9d4a1c-6f6f-4d0e-9d1e-2b7a5c8e1f33";
const ORG_UUID = "3f0c1d2e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const OWNER_ID = "11111111-1111-4111-8111-111111111111";
/** 2026-11-15T12:00:00Z = 2026-11-15 09:00 em São Paulo. */
const NOW = new Date("2026-11-15T12:00:00.000Z");

function repositoryMock(): ISalonTrafficReportRepository {
  return {
    findBarbershopScope: vi.fn().mockResolvedValue({
      id: SHOP_UUID,
      organizationId: null,
    }),
    findOrganizationOwnerId: vi.fn().mockResolvedValue(null),
    findDaily: vi.fn().mockResolvedValue([]),
    findHourly: vi.fn().mockResolvedValue([]),
    findSections: vi.fn().mockResolvedValue([]),
    findOrigins: vi.fn().mockResolvedValue([]),
    findFirstDay: vi.fn().mockResolvedValue(null),
  };
}

function query(overrides: Partial<SalonTrafficQuery> = {}): SalonTrafficQuery {
  return {
    period: "day",
    barbershopId: SHOP_UUID,
    readerId: OWNER_ID,
    readerRole: "OWNER",
    ...overrides,
  };
}

describe("GetSalonTrafficReportUseCase", () => {
  let repo: ISalonTrafficReportRepository;
  let useCase: GetSalonTrafficReportUseCase;

  beforeEach(() => {
    repo = repositoryMock();
    useCase = new GetSalonTrafficReportUseCase(repo);
    process.env.TRAFFIC_BEACON_ENABLED = "true";
  });

  afterEach(() => {
    delete process.env.TRAFFIC_BEACON_ENABLED;
  });

  it("devolve listas vazias quando não há dados (estado vazio da UI)", async () => {
    const payload = await useCase.execute(query(), NOW);

    expect(payload.totals).toEqual({
      visits: 0,
      visitors: 0,
      visitorsBasis: "daily_distinct",
    });
    expect(payload.prevTotals).toBeNull();
    expect(payload.deltaPct).toBeNull();
    expect(payload.series).toEqual([]);
    expect(payload.sections).toEqual([]);
    expect(payload.origins).toEqual([]);
    expect(payload.beaconEnabled).toBe(true);
    expect(payload.generatedAt).toBe(NOW.toISOString());
  });

  it("sinaliza o beacon desligado no payload (a UI esconde os números)", async () => {
    process.env.TRAFFIC_BEACON_ENABLED = "false";

    const payload = await useCase.execute(query(), NOW);

    expect(payload.beaconEnabled).toBe(false);
  });

  it("lança 404 quando o salão da rota não existe", async () => {
    vi.mocked(repo.findBarbershopScope).mockResolvedValue(null);

    await expect(useCase.execute(query(), NOW)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("monta 24 buckets de hora em period=day, marcando só a hora corrente", async () => {
    vi.mocked(repo.findHourly).mockResolvedValue([
      { day: "2026-11-15", hour: 9, visits: 3, visitors: 2 },
      { day: "2026-11-15", hour: 8, visits: 1, visitors: 1 },
    ] satisfies SalonTrafficHourlyRow[]);
    vi.mocked(repo.findDaily).mockResolvedValue([
      { day: "2026-11-15", visits: 4, visitors: 3 },
    ] satisfies SalonTrafficDailyRow[]);

    const payload = await useCase.execute(query({ period: "day" }), NOW);

    expect(payload.series).toHaveLength(24);
    expect(payload.series[9]).toMatchObject({
      bucketStart: "2026-11-15T09",
      label: "09:00",
      visits: 3,
      visitors: 2,
      partial: true,
    });
    expect(payload.series[8]).toMatchObject({
      bucketStart: "2026-11-15T08",
      visits: 1,
      visitors: 1,
      partial: false,
    });
    expect(payload.totals).toEqual({
      visits: 4,
      visitors: 3,
      visitorsBasis: "daily_distinct",
    });
  });

  it("monta 7 buckets de dia em period=week com visitorsBasis somado", async () => {
    vi.mocked(repo.findDaily).mockResolvedValue([
      { day: "2026-11-15", visits: 4, visitors: 3 },
      { day: "2026-11-14", visits: 2, visitors: 2 },
    ] satisfies SalonTrafficDailyRow[]);

    const payload = await useCase.execute(query({ period: "week" }), NOW);

    expect(payload.series).toHaveLength(7);
    expect(payload.totals).toEqual({
      visits: 6,
      visitors: 5,
      visitorsBasis: "sum_of_daily_distinct",
    });
    expect(payload.series.filter((point) => point.partial)).toEqual([
      expect.objectContaining({ bucketStart: "2026-11-15" }),
    ]);
  });

  it("compara com a janela anterior de mesmo tamanho e calcula o delta", async () => {
    vi.mocked(repo.findDaily).mockImplementation(async (fromDay) => {
      if (fromDay === "2026-11-09") {
        return [{ day: "2026-11-15", visits: 10, visitors: 5 }];
      }
      return [{ day: "2026-11-02", visits: 4, visitors: 4 }];
    });

    const payload = await useCase.execute(query({ period: "week" }), NOW);

    expect(payload.prevTotals).toEqual({
      visits: 4,
      visitors: 4,
      visitorsBasis: "sum_of_daily_distinct",
    });
    expect(payload.deltaPct).toEqual({ visits: 150, visitors: 25 });
  });

  it("mantém prevTotals e deltaPct nulos quando a janela anterior não teve tráfego", async () => {
    vi.mocked(repo.findDaily).mockImplementation(async (fromDay) => {
      if (fromDay === "2026-11-09") {
        return [{ day: "2026-11-15", visits: 10, visitors: 5 }];
      }
      return [];
    });

    const payload = await useCase.execute(query({ period: "week" }), NOW);

    expect(payload.prevTotals).toBeNull();
    expect(payload.deltaPct).toBeNull();
  });

  it("mantém o delta nulo quando a base da janela anterior é zero", async () => {
    vi.mocked(repo.findDaily).mockImplementation(async (fromDay) => {
      if (fromDay === "2026-11-09") {
        return [{ day: "2026-11-15", visits: 10, visitors: 5 }];
      }
      return [{ day: "2026-11-02", visits: 0, visitors: 0 }];
    });

    const payload = await useCase.execute(query({ period: "week" }), NOW);

    // Sem tráfego anterior não há base de comparação: `prevTotals` é nulo.
    expect(payload.prevTotals).toBeNull();
    expect(payload.deltaPct).toBeNull();
  });

  it("devolve as cinco seções fixas com zero quando não houve ping de seção", async () => {
    vi.mocked(repo.findDaily).mockResolvedValue([
      { day: "2026-11-15", visits: 2, visitors: 2 },
    ]);

    const payload = await useCase.execute(query(), NOW);

    expect(payload.sections).toEqual([
      { section: "profile", visits: 0, visitors: 0 },
      { section: "queue", visits: 0, visitors: 0 },
      { section: "appointments", visits: 0, visitors: 0 },
      { section: "products", visits: 0, visitors: 0 },
      { section: "other", visits: 0, visitors: 0 },
    ]);
  });

  it("agrega as seções e devolve as origens por host", async () => {
    vi.mocked(repo.findDaily).mockResolvedValue([
      { day: "2026-11-15", visits: 2, visitors: 2 },
    ]);
    vi.mocked(repo.findSections).mockResolvedValue([
      { section: "queue", visits: 3, visitors: 2 },
      { section: "profile", visits: 1, visitors: 1 },
    ] satisfies SalonTrafficSectionRow[]);
    vi.mocked(repo.findOrigins).mockResolvedValue([
      { origin: "www.instagram.com", visits: 2 },
    ] satisfies SalonTrafficOriginRow[]);

    const payload = await useCase.execute(query(), NOW);

    expect(payload.sections).toContainEqual({
      section: "queue",
      visits: 3,
      visitors: 2,
    });
    expect(payload.origins).toEqual([{ host: "www.instagram.com", visits: 2 }]);
  });

  it("restringe a leitura ao próprio salão para um dono de unidade", async () => {
    vi.mocked(repo.findBarbershopScope).mockResolvedValue({
      id: SHOP_UUID,
      organizationId: ORG_UUID,
    });
    vi.mocked(repo.findOrganizationOwnerId).mockResolvedValue("outro-dono");

    await useCase.execute(query({ readerRole: "OWNER" }), NOW);

    expect(vi.mocked(repo.findDaily).mock.calls[0]![2]).toEqual([`b:${SHOP_UUID}`]);
  });

  it("inclui o agregado da organização para o dono da organização", async () => {
    vi.mocked(repo.findBarbershopScope).mockResolvedValue({
      id: SHOP_UUID,
      organizationId: ORG_UUID,
    });
    vi.mocked(repo.findOrganizationOwnerId).mockResolvedValue(OWNER_ID);

    await useCase.execute(query({ readerRole: "OWNER" }), NOW);

    expect(vi.mocked(repo.findDaily).mock.calls[0]![2]).toEqual([
      `b:${SHOP_UUID}`,
      `o:${ORG_UUID}`,
    ]);
  });

  it("inclui o agregado da organização para o MASTER_ADMIN", async () => {
    vi.mocked(repo.findBarbershopScope).mockResolvedValue({
      id: SHOP_UUID,
      organizationId: ORG_UUID,
    });
    vi.mocked(repo.findOrganizationOwnerId).mockResolvedValue("outro-dono");

    await useCase.execute(query({ readerRole: "MASTER_ADMIN", readerId: "master" }), NOW);

    expect(vi.mocked(repo.findDaily).mock.calls[0]![2]).toEqual([
      `b:${SHOP_UUID}`,
      `o:${ORG_UUID}`,
    ]);
  });

  it("nunca consulta dados de outro salão", async () => {
    await useCase.execute(query(), NOW);

    for (const call of vi.mocked(repo.findDaily).mock.calls) {
      expect(call[2]).not.toContain(`o:${ORG_UUID}`);
      expect(call[2].every((target) => target === `b:${SHOP_UUID}`)).toBe(true);
    }
  });

  it("expõe o primeiro dia com dados (dataFrom) e a janela no payload", async () => {
    vi.mocked(repo.findFirstDay).mockResolvedValue("2026-10-01");

    const payload = await useCase.execute(query({ period: "week" }), NOW);

    expect(payload.period).toMatchObject({
      key: "week",
      label: "Últimos 7 dias",
      granularity: "day",
      fromDay: "2026-11-09",
      toDay: "2026-11-15",
      prevFromDay: "2026-11-02",
      prevToDay: "2026-11-08",
      timezone: "America/Sao_Paulo",
      dataFrom: "2026-10-01",
    });
  });
});
