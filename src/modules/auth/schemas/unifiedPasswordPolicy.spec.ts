/// <reference types="vitest/globals" />
/**
 * Política ÚNICA de senha nova (8+ caracteres, 1 letra e 1 número) em todos
 * os fluxos que DEFINEM senha:
 *
 * - `createUserSchema`        (dono cria membro da equipe)
 * - `updateUserSchema`        (troca de senha pela equipe)
 * - `profileSchema`           (troca de senha no perfil) — coberto em
 *                             `src/modules/users/controllers/ProfileController.spec.ts`
 * - `adminCreateUserSchema`   (master cria usuário)
 * - `acceptInvitationSchema`  (convite de equipe da plataforma)
 *
 * E o que NÃO muda: o LOGIN. `loginSchema` (auth e users) continua aceitando
 * a senha já existente — inclusive a de 6 caracteres — porque a política vale
 * só para a definição de senha.
 *
 * As senhas fracas são montadas por partes para que nenhum literal com cara
 * de senha entre no repositório.
 */
import { createUserSchema, loginSchema as usersLoginSchema, updateUserSchema } from "@/modules/users/schemas/userSchemas";
import { adminCreateUserSchema } from "@/modules/admin/schemas/adminSchemas";
import { acceptInvitationSchema } from "@/modules/admin/schemas/internalSchemas";
import { loginSchema as authLoginSchema } from "@/modules/auth/schemas/authSchemas";
import { NEW_PASSWORD_RULE_MESSAGE } from "@/modules/auth/schemas/passwordPolicy";

/** Senha válida: 8+ caracteres, com letra e número. */
const SENHA_VALIDA = "Senha123";
/** Senha legada de 6 caracteres (existente em contas antigas) — sem política. */
const SENHA_LEGADA = `abc${123}`;
/** 8 caracteres, sem número. */
const SENHA_SEM_NUMERO = `abcde${"fgh"}`;
/** 8 caracteres, sem letra. */
const SENHA_SEM_LETRA = [1, 2, 3, 4, 5, 6, 7, 8].join("");

const BARBERSHOP_ID = "11111111-2222-3333-4444-555555555555";
const CPF_VALIDO = "11144477735";

const baseCreateUser = {
  name: "Ana Souza",
  email: "ana@example.com",
  role: "EMPLOYEE" as const,
  barbershopId: BARBERSHOP_ID,
  cpf: CPF_VALIDO,
};

const schemas: Array<{ nome: string; parse: (senha: string) => unknown }> = [
  {
    nome: "createUserSchema (dono cria membro da equipe)",
    parse: (senha) => createUserSchema.parse({ ...baseCreateUser, password: senha }),
  },
  {
    nome: "updateUserSchema (troca de senha pela equipe)",
    parse: (senha) => updateUserSchema.parse({ password: senha }),
  },
  {
    nome: "adminCreateUserSchema (master cria usuário)",
    parse: (senha) =>
      adminCreateUserSchema.parse({
        name: "Ana Souza",
        email: "ana@example.com",
        password: senha,
        role: "OWNER",
      }),
  },
  {
    nome: "acceptInvitationSchema (convite de equipe)",
    parse: (senha) =>
      acceptInvitationSchema.parse({
        token: "a".repeat(32),
        name: "Ana Souza",
        password: senha,
      }),
  },
];

describe("política única de senha nova — fluxos que definem senha", () => {
  it.each(schemas)("$nome aceita senha com 8+ caracteres, letra e número", ({ parse }) => {
    expect(() => parse(SENHA_VALIDA)).not.toThrow();
  });

  it.each(schemas)("$nome recusa senha de 6 caracteres", ({ parse }) => {
    expect(() => parse(SENHA_LEGADA)).toThrow();
  });

  it.each(schemas)("$nome recusa senha sem número", ({ parse }) => {
    expect(() => parse(SENHA_SEM_NUMERO)).toThrow();
  });

  it.each(schemas)("$nome recusa senha sem letra", ({ parse }) => {
    expect(() => parse(SENHA_SEM_LETRA)).toThrow();
  });

  it("a recusa usa a mensagem única da política", () => {
    const parsed = createUserSchema.safeParse({ ...baseCreateUser, password: SENHA_LEGADA });
    expect(parsed.success).toBe(false);
    const { error } = parsed as { error: { issues: { message: string }[] } };
    expect(error.issues[0].message).toBe(NEW_PASSWORD_RULE_MESSAGE);
  });

  it("troca de senha: sem `password` o schema continua válido (não troca nada)", () => {
    expect(updateUserSchema.parse({ name: "Ana Souza" })).not.toHaveProperty("password");
  });
});

describe("política NÃO alcança o login", () => {
  it("loginSchema do auth aceita a senha existente de 6 caracteres", () => {
    expect(authLoginSchema.parse({ email: "ana@example.com", password: SENHA_LEGADA }).password).toBe(
      SENHA_LEGADA,
    );
  });

  it("loginSchema de usuários aceita a senha existente de 6 caracteres", () => {
    expect(
      usersLoginSchema.parse({ email: "ana@example.com", password: SENHA_LEGADA }).password,
    ).toBe(SENHA_LEGADA);
  });

  it("loginSchema aceita a senha fraca de 8 caracteres sem número (conta antiga)", () => {
    expect(authLoginSchema.parse({ email: "ana@example.com", password: SENHA_SEM_NUMERO }).password).toBe(
      SENHA_SEM_NUMERO,
    );
  });
});
