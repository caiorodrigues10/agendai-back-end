import {
  acceptInvitationSchema,
  createTaskSchema,
  createTicketSchema,
  listTasksQuerySchema,
  listTicketsQuerySchema,
  updateTaskSchema,
  updateTicketSchema,
} from "./internalSchemas";

describe("admin internal schemas", () => {
  it("applies safe defaults when creating a ticket", () => {
    expect(createTicketSchema.parse({
      title: "Não consegue entrar",
      description: "O administrador relata erro no acesso.",
    })).toMatchObject({ channel: "OTHER", category: "QUESTION", priority: "NORMAL" });
  });

  it("rejects an invalid salon id and unknown ticket fields", () => {
    expect(() => createTicketSchema.parse({
      title: "Falha",
      description: "Detalhe",
      barbershopId: "shop-1",
    })).toThrow();
    expect(() => createTicketSchema.parse({
      title: "Falha",
      description: "Detalhe",
      internal: true,
    })).toThrow();
  });

  it("requires a version and accepts nullable ticket assignee", () => {
    expect(updateTicketSchema.parse({ version: 2, assignedToId: null })).toEqual({
      version: 2,
      assignedToId: null,
    });
    expect(() => updateTicketSchema.parse({ status: "DONE", version: 2 })).toThrow();
  });

  it("validates ticket list filters and applies pagination defaults", () => {
    expect(listTicketsQuerySchema.parse({ status: "OPEN" })).toMatchObject({
      status: "OPEN",
      page: 1,
      limit: 25,
    });
    expect(() => listTicketsQuerySchema.parse({ limit: 101 })).toThrow();
    expect(() => listTicketsQuerySchema.parse({ assignedToId: "admin-1" })).toThrow();
  });

  it("validates task creation, dates and optional relationships", () => {
    const task = createTaskSchema.parse({
      title: "Verificar cobrança",
      dueDate: "2026-09-22T12:00:00.000Z",
      ticketId: "00000000-0000-4000-8000-000000000001",
    });
    expect(task.priority).toBe("NORMAL");
    expect(() => createTaskSchema.parse({ title: "A", dueDate: "22/09/2026" })).toThrow();
  });

  it("requires task version and validates task filters", () => {
    expect(updateTaskSchema.parse({ version: 1, status: "BLOCKED" })).toEqual({
      version: 1,
      status: "BLOCKED",
    });
    expect(listTasksQuerySchema.parse({ dueAfter: "2026-09-22T00:00:00.000Z" })).toMatchObject({
      page: 1,
      limit: 25,
    });
  });

  it("requires a sufficiently long invitation token and valid credentials", () => {
    const token = "a".repeat(32);
    expect(acceptInvitationSchema.parse({ token, name: "Ana", password: "senha123" })).toEqual({
      token,
      name: "Ana",
      password: "senha123",
    });
    expect(() => acceptInvitationSchema.parse({ token: "short", name: "Ana", password: "senha123" })).toThrow();
  });
});
