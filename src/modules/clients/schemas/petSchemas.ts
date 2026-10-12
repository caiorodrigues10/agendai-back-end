import { z } from "zod";

export const petSpeciesEnum = z.enum(["DOG", "CAT", "OTHER"]);
export const petSizeEnum = z.enum(["SMALL", "MEDIUM", "LARGE", "EXTRA_LARGE"]);

export const createPetSchema = z.object({
  name: z.string().min(1, "Nome do pet obrigatório").max(120),
  species: petSpeciesEnum.optional(),
  breed: z.string().max(120).nullable().optional(),
  size: petSizeEnum.nullable().optional(),
  coat: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const updatePetSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  species: petSpeciesEnum.optional(),
  breed: z.string().max(120).nullable().optional(),
  size: petSizeEnum.nullable().optional(),
  coat: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  active: z.boolean().optional(),
});

export type CreatePetInput = z.infer<typeof createPetSchema>;
export type UpdatePetInput = z.infer<typeof updatePetSchema>;
