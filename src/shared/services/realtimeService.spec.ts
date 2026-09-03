import { describe, it, expect, beforeEach } from "vitest";
import { RealtimeHub, type RealtimeEvent } from "./realtimeService";

function mockSocket() {
  const sent: string[] = [];
  return {
    sent,
    readyState: 1 as 0 | 1 | 2 | 3,
    send(data: string) {
      sent.push(data);
    },
  };
}

describe("RealtimeHub", () => {
  let hub: RealtimeHub;

  beforeEach(() => {
    hub = new RealtimeHub();
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
});
