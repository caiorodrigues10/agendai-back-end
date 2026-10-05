/// <reference types="vitest/globals" />
import { RealtimeHub, type RealtimeEvent } from "./realtimeService";

const fake = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;
  let seq = 0;

  const state = {
    clients: [] as FakeRedis[],
    quitOrder: [] as number[],
    nextConnectFailures: 0,
    base: undefined as unknown as FakeRedis,
  };

  class FakeRedis {
    readonly id = ++seq;
    readonly handlers = new Map<string, Listener[]>();
    failConnect = false;
    failPublish = false;
    connectCalls = 0;
    psubscribeCalls = 0;
    subscribePattern: string | null = null;
    publishCalls: Array<{ channel: string; message: string }> = [];
    quitCalls = 0;

    duplicate = (): FakeRedis => {
      const client = new FakeRedis();
      if (state.nextConnectFailures > 0) {
        state.nextConnectFailures -= 1;
        client.failConnect = true;
      }
      state.clients.push(client);
      return client;
    };

    on(event: string, listener: Listener): this {
      const listeners = this.handlers.get(event) ?? [];
      listeners.push(listener);
      this.handlers.set(event, listeners);
      return this;
    }

    emit(event: string, ...args: unknown[]): void {
      for (const listener of this.handlers.get(event) ?? []) listener(...args);
    }

    async connect(): Promise<void> {
      this.connectCalls += 1;
      if (this.failConnect) {
        const err = new Error("ECONNREFUSED");
        this.emit("error", err);
        throw err;
      }
    }

    async psubscribe(pattern: string): Promise<number> {
      this.psubscribeCalls += 1;
      this.subscribePattern = pattern;
      return 1;
    }

    async publish(channel: string, message: string): Promise<number> {
      if (this.failPublish) throw new Error("Connection is closed.");
      this.publishCalls.push({ channel, message });
      return 1;
    }

    async quit(): Promise<string> {
      this.quitCalls += 1;
      state.quitOrder.push(this.id);
      return "OK";
    }

    disconnect(): void {}
  }

  state.base = new FakeRedis();
  return state;
});

vi.mock("@/shared/infra/queue/redisConnection", () => ({
  getRedisConnection: () => fake.base,
}));

const RETRY_CAP_MS = 31_000;

function resetFake(): void {
  fake.clients = [];
  fake.quitOrder = [];
  fake.nextConnectFailures = 0;
}

function mockSocket(
  overrides: { readyState?: 0 | 1 | 2 | 3; bufferedAmount?: number } = {}
) {
  const sent: string[] = [];
  return {
    sent,
    readyState: (overrides.readyState ?? 1) as 0 | 1 | 2 | 3,
    bufferedAmount: overrides.bufferedAmount,
    send(data: string) {
      sent.push(data);
    },
  };
}

describe("RealtimeHub", () => {
  let hub: RealtimeHub;

  beforeEach(() => {
    vi.stubEnv("ALLOW_TEST_REDIS", "");
    resetFake();
    hub = new RealtimeHub();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("entrega o evento só para sockets do mesmo salão", async () => {
    const shopA = mockSocket();
    const shopB = mockSocket();
    hub.addConnection("shop-1", shopA);
    hub.addConnection("shop-2", shopB);

    await hub.publish("shop-1", "queue:changed");

    expect(shopA.sent).toHaveLength(1);
    expect(JSON.parse(shopA.sent[0])).toEqual({
      type: "queue:changed",
      barbershopId: "shop-1",
    });
    expect(shopB.sent).toHaveLength(0);
  });

  it("não envia para socket fechado e remove da lista", async () => {
    const closed = mockSocket();
    closed.readyState = 3;
    hub.addConnection("shop-1", closed);
    await hub.publish("shop-1", "appointments:changed");
    expect(closed.sent).toHaveLength(0);
  });

  it("onLocal recebe fanout em memória", async () => {
    const events: RealtimeEvent[] = [];
    const off = hub.onLocal((event) => events.push(event));
    await hub.publish("shop-9", "appointments:changed");
    expect(events).toEqual([{ type: "appointments:changed", barbershopId: "shop-9" }]);
    off();
    await hub.publish("shop-9", "queue:changed");
    expect(events).toHaveLength(1);
  });

  it("removeConnection impede entregas posteriores", async () => {
    const socket = mockSocket();
    hub.addConnection("shop-1", socket);
    hub.removeConnection("shop-1", socket);
    await hub.publish("shop-1", "queue:changed");
    expect(socket.sent).toHaveLength(0);
  });

  it("start() em VITEST sem ALLOW_TEST_REDIS sai cedo sem tocar no Redis", async () => {
    await hub.start();
    expect(fake.clients).toHaveLength(0);
    await hub.stop();
  });

  it("mantém o limite por salão descartando o socket mais antigo", async () => {
    const sockets = Array.from({ length: 101 }, () => mockSocket());
    for (const socket of sockets) hub.addConnection("shop-1", socket);

    await hub.publish("shop-1", "queue:changed");

    expect(sockets[0].sent).toHaveLength(0);
    expect(sockets[1].sent).toHaveLength(1);
    expect(sockets[100].sent).toHaveLength(1);
  });

  it("respeita o limite global mesmo com todos os salões abaixo do teto", async () => {
    const shop0 = Array.from({ length: 99 }, () => mockSocket());
    for (const socket of shop0) hub.addConnection("shop-0", socket);
    for (let shop = 1; shop < 50; shop += 1) {
      for (let i = 0; i < 99; i += 1) hub.addConnection(`shop-${shop}`, mockSocket());
    }
    const extraShop = Array.from({ length: 50 }, () => mockSocket());
    for (const socket of extraShop) hub.addConnection("shop-extra", socket);

    const newcomer = mockSocket();
    hub.addConnection("shop-extra", newcomer);

    await hub.publish("shop-0", "queue:changed");
    expect(shop0[0].sent).toHaveLength(0);
    for (const socket of shop0.slice(1)) expect(socket.sent).toHaveLength(1);

    await hub.publish("shop-extra", "queue:changed");
    for (const socket of [...extraShop, newcomer]) expect(socket.sent).toHaveLength(1);
  });

  it("descarta socket com bufferedAmount acima do teto sem lançar", async () => {
    const stuck = mockSocket({ bufferedAmount: 2 * 1024 * 1024 });
    const atLimit = mockSocket({ bufferedAmount: 1024 * 1024 });
    const healthy = mockSocket({ bufferedAmount: 0 });
    const unmeasured = mockSocket();
    hub.addConnection("shop-1", stuck);
    hub.addConnection("shop-1", atLimit);
    hub.addConnection("shop-1", healthy);
    hub.addConnection("shop-1", unmeasured);

    await expect(hub.publish("shop-1", "queue:changed")).resolves.toBeUndefined();

    expect(stuck.sent).toHaveLength(0);
    expect(atLimit.sent).toHaveLength(1);
    expect(healthy.sent).toHaveLength(1);
    expect(unmeasured.sent).toHaveLength(1);

    await hub.publish("shop-1", "queue:changed");

    expect(stuck.sent).toHaveLength(0);
    expect(atLimit.sent).toHaveLength(2);
    expect(healthy.sent).toHaveLength(2);
    expect(unmeasured.sent).toHaveLength(2);
  });

  it("remove do mapa o socket cujo send lança", async () => {
    const broken = mockSocket();
    const healthy = mockSocket();
    let attempts = 0;
    broken.send = () => {
      attempts += 1;
      throw new Error("EPIPE");
    };
    hub.addConnection("shop-1", broken);
    hub.addConnection("shop-1", healthy);

    await expect(hub.publish("shop-1", "queue:changed")).resolves.toBeUndefined();
    expect(attempts).toBe(1);
    expect(healthy.sent).toHaveLength(1);

    await hub.publish("shop-1", "queue:changed");
    expect(attempts).toBe(1);
    expect(healthy.sent).toHaveLength(2);
  });

  describe("pub/sub com Redis (mockado)", () => {
    beforeEach(() => {
      vi.stubEnv("ALLOW_TEST_REDIS", "1");
    });

    afterEach(async () => {
      await hub.stop();
      vi.useRealTimers();
    });

    it("retoma o pub/sub após falha no connect inicial", async () => {
      vi.useFakeTimers();
      fake.nextConnectFailures = 1;

      await hub.start();
      expect(fake.clients).toHaveLength(2);
      expect(fake.clients[0].connectCalls).toBe(1);

      await vi.advanceTimersByTimeAsync(100);
      expect(fake.clients).toHaveLength(2);

      const events: RealtimeEvent[] = [];
      hub.onLocal((event) => events.push(event));
      await hub.publish("shop-1", "queue:changed");
      expect(events).toHaveLength(1);
      expect(fake.clients[0].publishCalls).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(RETRY_CAP_MS);
      expect(fake.clients).toHaveLength(4);

      await hub.publish("shop-1", "queue:changed");
      expect(events).toHaveLength(1);
      expect(fake.clients[2].publishCalls).toHaveLength(1);
      expect(fake.clients[3].psubscribeCalls).toBe(1);
      expect(fake.clients[3].subscribePattern).toBe("agendai:realtime:*");
      expect(JSON.parse(fake.clients[2].publishCalls[0].message)).toEqual({
        type: "queue:changed",
        barbershopId: "shop-1",
      });
    });

    it("retoma o pub/sub quando o subscriber emite erro de conexão", async () => {
      vi.useFakeTimers();
      await hub.start();
      expect(fake.clients).toHaveLength(2);
      const publisher = fake.clients[0];
      const subscriber = fake.clients[1];

      subscriber.emit("error", new Error("Connection is closed."));

      expect(subscriber.quitCalls).toBe(1);
      expect(publisher.quitCalls).toBe(1);
      expect(fake.quitOrder).toEqual([subscriber.id, publisher.id]);

      await vi.advanceTimersByTimeAsync(RETRY_CAP_MS);
      expect(fake.clients).toHaveLength(4);
      expect(fake.clients[3].psubscribeCalls).toBe(1);

      await hub.publish("shop-1", "queue:changed");
      expect(fake.clients[2].publishCalls).toHaveLength(1);
    });

    it("falha no publish cai para memória e agenda a retomada", async () => {
      vi.useFakeTimers();
      await hub.start();
      fake.clients[0].failPublish = true;

      const events: RealtimeEvent[] = [];
      hub.onLocal((event) => events.push(event));
      await hub.publish("shop-1", "queue:changed");

      expect(events).toHaveLength(1);
      expect(fake.clients[0].quitCalls).toBe(1);
      expect(fake.clients[1].quitCalls).toBe(1);

      await vi.advanceTimersByTimeAsync(RETRY_CAP_MS);
      expect(fake.clients).toHaveLength(4);

      await hub.publish("shop-1", "queue:changed");
      expect(events).toHaveLength(1);
      expect(fake.clients[2].publishCalls).toHaveLength(1);
    });

    it("stop() fecha subscriber e publisher e não tenta reconectar", async () => {
      vi.useFakeTimers();
      await hub.start();
      const publisher = fake.clients[0];
      const subscriber = fake.clients[1];

      await hub.stop();

      expect(subscriber.quitCalls).toBe(1);
      expect(publisher.quitCalls).toBe(1);
      expect(fake.quitOrder).toEqual([subscriber.id, publisher.id]);
      expect(vi.getTimerCount()).toBe(0);

      await vi.advanceTimersByTimeAsync(RETRY_CAP_MS * 2);
      expect(fake.clients).toHaveLength(2);
      expect(publisher.publishCalls).toHaveLength(0);
    });

    it("stop() cancela o retry pendente de uma tentativa que falhou", async () => {
      vi.useFakeTimers();
      fake.nextConnectFailures = 1;

      await hub.start();
      expect(vi.getTimerCount()).toBe(1);

      await hub.stop();
      expect(vi.getTimerCount()).toBe(0);

      await vi.advanceTimersByTimeAsync(RETRY_CAP_MS * 2);
      expect(fake.clients).toHaveLength(2);
    });
  });
});
