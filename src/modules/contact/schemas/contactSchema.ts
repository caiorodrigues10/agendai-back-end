import { z } from "zod";

export const contactTopics = [
  "planos",
  "suporte",
  "parceria",
  "outro",
] as const;

export const submitContactSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome").max(120),
  email: z.string().trim().email("E-mail inválido").max(200),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  topic: z.enum(contactTopics, {
    errorMap: () => ({ message: "Selecione um assunto válido" }),
  }),
  message: z.string().trim().min(10, "Mensagem muito curta").max(4000),
});

export type SubmitContactInput = z.infer<typeof submitContactSchema>;
