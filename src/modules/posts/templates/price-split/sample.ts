/**
 * Dados de exemplo do Modelo #1 — melhor caso e pior caso.
 * Pior caso: nome longo, 8+ itens, sem foto, sem logo, sem Instagram.
 */
import type { PriceSplitData } from "./template";

export const SAMPLE_BEST: PriceSplitData = {
  title: "TABELA DE VALORES",
  businessName: "Barbearia da Rua",
  segment: "BARBERSHOP",
  photoUrl: null, // usa stock do segmento
  whatsapp: "11999998888",
  instagram: "barbeariadarua",
  items: [
    { name: "Corte na tesoura", price: 45 },
    { name: "Corte máquina", price: 35 },
    { name: "Barba completa", price: 30 },
    { name: "Corte + barba", price: 70 },
    { name: "Platinado", price: 150 },
  ],
};

export const SAMPLE_WORST: PriceSplitData = {
  title: "TABELA DE VALORES COMPLETA DOS NOSSOS SERVIÇOS PREMIUM",
  businessName: "Estúdio de Beleza e Sobrancelhas São João Batista",
  segment: "LASH_BROW_STUDIO",
  photoUrl: null,
  logoUrl: null,
  whatsapp: null,
  instagram: null,
  items: [
    { name: "Design de sobrancelhas com pigmentação", price: 120 },
    { name: "Extensão de cílios volume fã clássico", price: 180 },
    { name: "Manutenção de cílios (retorno)", price: 90 },
    { name: "Limpeza de pele profunda", price: 150 },
    { name: "Aplicação de pgf", price: 200 },
    { name: "Buço e sobrancelha", price: 45 },
    { name: "Henna de sobrancelha", price: 70 },
    { name: "Peeling químico facial", price: 250 },
    { name: "Microagulhamento", price: 320 },
    { name: "Consultoria de estilo", price: null }, // sob consulta
  ],
};
