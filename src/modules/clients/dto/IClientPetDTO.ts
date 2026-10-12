export type PetSpecies = "DOG" | "CAT" | "OTHER";
export type PetSize = "SMALL" | "MEDIUM" | "LARGE" | "EXTRA_LARGE";

export interface ICreateClientPetDTO {
  barbershopId: string;
  clientId: string;
  name: string;
  species?: PetSpecies;
  breed?: string | null;
  size?: PetSize | null;
  coat?: string | null;
  notes?: string | null;
}

export interface IUpdateClientPetDTO {
  name?: string;
  species?: PetSpecies;
  breed?: string | null;
  size?: PetSize | null;
  coat?: string | null;
  notes?: string | null;
  active?: boolean;
}

export interface IClientPetResponseDTO {
  id: string;
  barbershopId: string;
  clientId: string;
  name: string;
  species: PetSpecies;
  breed: string | null;
  size: PetSize | null;
  coat: string | null;
  notes: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
