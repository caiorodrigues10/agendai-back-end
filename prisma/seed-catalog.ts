import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const connectionString = process.env.DATABASE_URL
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool as any)
const prisma = new PrismaClient({ adapter: adapter as any } as any)

interface CatalogCategoryInput {
  name: string
  icon: string
  sortOrder: number
  items: CatalogItemInput[]
}

interface CatalogItemInput {
  catalogKey: string
  name: string
  description?: string
  iconKey: string
  suggestedDurationMinutes: number
  sortOrder: number
}

const categories: CatalogCategoryInput[] = [
  {
    name: 'Cortes e finalização',
    icon: 'category.haircut',
    sortOrder: 0,
    items: [
      { catalogKey: 'haircut-classic', name: 'Corte clássico', description: 'Corte masculino com máquina e tesoura, acabamento na navalha.', iconKey: 'service.haircut', suggestedDurationMinutes: 30, sortOrder: 0 },
      { catalogKey: 'haircut-modern', name: 'Corte moderno', description: 'Corte com degradê, texturização e acabamento na tesoura.', iconKey: 'service.haircut-modern', suggestedDurationMinutes: 40, sortOrder: 1 },
      { catalogKey: 'haircut-scissors', name: 'Corte só tesoura', description: 'Corte exclusivo com tesoura, ideal para cabelos mais longos.', iconKey: 'service.haircut-scissors', suggestedDurationMinutes: 45, sortOrder: 2 },
      { catalogKey: 'haircut-child', name: 'Corte infantil', description: 'Corte para crianças com paciência e acabamento suave.', iconKey: 'service.haircut-child', suggestedDurationMinutes: 25, sortOrder: 3 },
      { catalogKey: 'haircut-shaver', name: 'Corte com máquina', description: 'Corte rápido com máquina em todas as pontuações.', iconKey: 'service.haircut-shaver', suggestedDurationMinutes: 20, sortOrder: 4 },
      { catalogKey: 'haircut-razor', name: 'Acabamento navalha', description: 'Acabamento de contorno e nuca com navalha.', iconKey: 'service.razor', suggestedDurationMinutes: 15, sortOrder: 5 },
      { catalogKey: 'haircut-wash', name: 'Lavagem e corte', description: 'Lavagem com hidratação rápida seguida de corte.', iconKey: 'service.wash', suggestedDurationMinutes: 35, sortOrder: 6 },
      { catalogKey: 'haircut-design', name: 'Corte com design', description: 'Corte com desenhos e linhas na máquina ou navalha.', iconKey: 'service.haircut-design', suggestedDurationMinutes: 45, sortOrder: 7 },
    ],
  },
  {
    name: 'Barba e grooming',
    icon: 'category.beard',
    sortOrder: 1,
    items: [
      { catalogKey: 'beard-trim', name: 'Barba básica', description: 'Aparar e modelar a barba com máquina.', iconKey: 'service.beard', suggestedDurationMinutes: 20, sortOrder: 0 },
      { catalogKey: 'beard-shape', name: 'Barba modelada', description: 'Modelagem com navalha, óleo e toalha quente.', iconKey: 'service.beard-shape', suggestedDurationMinutes: 30, sortOrder: 1 },
      { catalogKey: 'beard-full', name: 'Barba completa', description: 'Toalha quente, navalha, hidratação e finalização.', iconKey: 'service.beard-full', suggestedDurationMinutes: 40, sortOrder: 2 },
      { catalogKey: 'beard-royal', name: 'Barba royal', description: 'Tratamento premium com vapor, navalha e bálsamo.', iconKey: 'service.beard-royal', suggestedDurationMinutes: 50, sortOrder: 3 },
      { catalogKey: 'beard-mustache', name: 'Bigode', description: 'Aparar e modelar o bigode com navalha.', iconKey: 'service.mustache', suggestedDurationMinutes: 15, sortOrder: 4 },
      { catalogKey: 'beard-neckline', name: 'Contorno de pescoço', description: 'Limpeza do pescoço e contorno da barba.', iconKey: 'service.beard-neck', suggestedDurationMinutes: 15, sortOrder: 5 },
      { catalogKey: 'beard-eyebrow', name: 'Barba + sobrancelha', description: 'Barba completa com acabamento de sobrancelha.', iconKey: 'service.beard-eyebrow', suggestedDurationMinutes: 35, sortOrder: 6 },
    ],
  },
  {
    name: 'Coloração e química',
    icon: 'category.coloring',
    sortOrder: 2,
    items: [
      { catalogKey: 'color-hair', name: 'Coloração capilar', description: 'Pigmentação completa do cabelo na cor desejada.', iconKey: 'service.color', suggestedDurationMinutes: 90, sortOrder: 0 },
      { catalogKey: 'color-beard', name: 'Barba pigmentada', description: 'Coloração da barba para cobrir fios brancos.', iconKey: 'service.color-beard', suggestedDurationMinutes: 60, sortOrder: 1 },
      { catalogKey: 'color-highlights', name: 'Mechas', description: 'Mechas com chapinha ou papel alumínio.', iconKey: 'service.highlights', suggestedDurationMinutes: 120, sortOrder: 2 },
      { catalogKey: 'color-balayage', name: 'Balayage', description: 'Degradê suave de cores com technique balayage.', iconKey: 'service.balayage', suggestedDurationMinutes: 150, sortOrder: 3 },
      { catalogKey: 'color-bleach', name: 'Descoloração', description: 'Clareamento capilar para preparação de coloração.', iconKey: 'service.bleach', suggestedDurationMinutes: 90, sortOrder: 4 },
      { catalogKey: 'color-gloss', name: 'Gloss capilar', description: 'Brilho e reflexos com gloss sem amônia.', iconKey: 'service.gloss', suggestedDurationMinutes: 45, sortOrder: 5 },
      { catalogKey: 'color-touchup', name: 'Retoque de raiz', description: 'Retoque de mechas ou coloração na raiz.', iconKey: 'service.color-touch', suggestedDurationMinutes: 60, sortOrder: 6 },
    ],
  },
  {
    name: 'Tratamentos capilares',
    icon: 'category.treatment',
    sortOrder: 3,
    items: [
      { catalogKey: 'treatment-hydratation', name: 'Hidratação', description: 'Máscara hidratante profunda para cabelos ressecados.', iconKey: 'service.hydratation', suggestedDurationMinutes: 30, sortOrder: 0 },
      { catalogKey: 'treatment-nutrition', name: 'Nutrição', description: 'Tratamento com óleos e manteigas para nutrir o fio.', iconKey: 'service.nutrition', suggestedDurationMinutes: 35, sortOrder: 1 },
      { catalogKey: 'treatment-reconstruction', name: 'Reconstrução', description: 'Tratamento para fios danificados por química.', iconKey: 'service.reconstruction', suggestedDurationMinutes: 40, sortOrder: 2 },
      { catalogKey: 'treatment-plating', name: 'Placagem capilar', description: 'Selamento com keratina para alisar e dar brilho.', iconKey: 'service.plating', suggestedDurationMinutes: 90, sortOrder: 3 },
      { catalogKey: 'treatment-keratin', name: 'Keratina', description: 'Tratamento com keratina para redução de体积.', iconKey: 'service.keratin', suggestedDurationMinutes: 120, sortOrder: 4 },
      { catalogKey: 'treatment-cysteine', name: 'Cisteína', description: 'Tratamento com cisteína para cabelos crespos.', iconKey: 'service.cysteine', suggestedDurationMinutes: 100, sortOrder: 5 },
      { catalogKey: 'treatment-scalp', name: 'Tratamento capilar', description: 'Tratamento para caspa e oleidade do couro cabeludo.', iconKey: 'service.scalp', suggestedDurationMinutes: 30, sortOrder: 6 },
    ],
  },
  {
    name: 'Tranças, extensões e dreads',
    icon: 'category.braids',
    sortOrder: 4,
    items: [
      { catalogKey: 'braids-box', name: 'Box braids', description: 'Tranças box braids no tamanho desejado.', iconKey: 'service.braids-box', suggestedDurationMinutes: 240, sortOrder: 0 },
      { catalogKey: 'braids-cornrow', name: 'Código de negridão', description: 'Tranças coladas ao couro cabeludo em padrões.', iconKey: 'service.braids-cornrow', suggestedDurationMinutes: 180, sortOrder: 1 },
      { catalogKey: 'braids-twist', name: 'Twists', description: 'Twists afro com two-strand em todo o cabelo.', iconKey: 'service.braids-twist', suggestedDurationMinutes: 150, sortOrder: 2 },
      { catalogKey: 'dreads-install', name: 'Instalação de dreads', description: 'Instalação de dreads com crochet ou palm roll.', iconKey: 'service.dreads', suggestedDurationMinutes: 180, sortOrder: 3 },
      { catalogKey: 'dreads-maintain', name: 'Manutenção de dreads', description: 'Retoque de raiz e limpeza dos dreads.', iconKey: 'service.dreads-maintain', suggestedDurationMinutes: 120, sortOrder: 4 },
      { catalogKey: 'extensions-clip', name: 'Extensões clip', description: 'Extensões com presilha para volume e comprimento.', iconKey: 'service.extensions-clip', suggestedDurationMinutes: 60, sortOrder: 5 },
      { catalogKey: 'extensions-sew', name: 'Extensões cosidas', description: 'Extensões costuradas ao cabelo natural.', iconKey: 'service.extensions-sew', suggestedDurationMinutes: 150, sortOrder: 6 },
    ],
  },
  {
    name: 'Unhas',
    icon: 'category.nails',
    sortOrder: 5,
    items: [
      { catalogKey: 'nails-manicure', name: 'Manicure', description: 'Cutilagem, lixamento e esmaltação das mãos.', iconKey: 'service.nails', suggestedDurationMinutes: 40, sortOrder: 0 },
      { catalogKey: 'nails-pedicure', name: 'Pedicure', description: 'Cutilagem, lixamento e esmaltação dos pés.', iconKey: 'service.nails-feet', suggestedDurationMinutes: 45, sortOrder: 1 },
      { catalogKey: 'nails-gel', name: 'Unhas em gel', description: 'Alongamento e modelagem em gel.', iconKey: 'service.nails-gel', suggestedDurationMinutes: 90, sortOrder: 2 },
      { catalogKey: 'nails-acrylic', name: 'Unhas acrílicas', description: 'Alongamento com molde em acrílico.', iconKey: 'service.nails-acrylic', suggestedDurationMinutes: 90, sortOrder: 3 },
      { catalogKey: 'nails-gel-polish', name: 'Esmaltação em gel', description: 'Esmaltação com gel sem laminação.', iconKey: 'service.nails-gel-polish', suggestedDurationMinutes: 30, sortOrder: 4 },
      { catalogKey: 'nails-nail-art', name: 'Nail art', description: 'Decoração artística nas unhas.', iconKey: 'service.nails-art', suggestedDurationMinutes: 60, sortOrder: 5 },
      { catalogKey: 'nails-man-pedi', name: 'Man & pedi', description: 'Manicure e pedicure para homens.', iconKey: 'service.nails-man', suggestedDurationMinutes: 50, sortOrder: 6 },
    ],
  },
  {
    name: 'Sobrancelhas e cílios',
    icon: 'category.eyebrows',
    sortOrder: 6,
    items: [
      { catalogKey: 'eyebrow-design', name: 'Design de sobrancelha', description: 'Modelagem com navalha ou pinça.', iconKey: 'service.eyebrow', suggestedDurationMinutes: 20, sortOrder: 0 },
      { catalogKey: 'eyebrow-henna', name: 'Henna de sobrancelha', description: 'Pigmentação com henna para volume visual.', iconKey: 'service.eyebrow-henna', suggestedDurationMinutes: 30, sortOrder: 1 },
      { catalogKey: 'eyebrow-thread', name: 'Fio dental', description: 'Limpeza com fio dental para precisão.', iconKey: 'service.eyebrow-thread', suggestedDurationMinutes: 15, sortOrder: 2 },
      { catalogKey: 'eyebrow-lamination', name: 'Lamination de sobrancelha', description: 'Lamination para sobrancelhas disciplinadas.', iconKey: 'service.eyebrow-lam', suggestedDurationMinutes: 40, sortOrder: 3 },
      { catalogKey: 'eyelash-extend', name: 'Extensão de cílios', description: 'Aplicação de fios individuais de cílios.', iconKey: 'service.eyelash', suggestedDurationMinutes: 90, sortOrder: 4 },
      { catalogKey: 'eyelash-lift', name: 'Lift de cílios', description: 'Curvatura permanente dos cílios naturais.', iconKey: 'service.eyelash-lift', suggestedDurationMinutes: 50, sortOrder: 5 },
      { catalogKey: 'eyebrow-tint', name: 'Pigmentação de cílios', description: 'Coloração dos cílios para definição.', iconKey: 'service.eyelash-tint', suggestedDurationMinutes: 25, sortOrder: 6 },
    ],
  },
  {
    name: 'Estética facial',
    icon: 'category.facial',
    sortOrder: 7,
    items: [
      { catalogKey: 'facial-cleaning', name: 'Limpeza de pele', description: 'Limpeza profunda com extração e máscara.', iconKey: 'service.facial-cleaning', suggestedDurationMinutes: 60, sortOrder: 0 },
      { catalogKey: 'facial-hydra', name: 'Hidra facial', description: 'Hidratação profunda com ácido hialurônico.', iconKey: 'service.facial-hydra', suggestedDurationMinutes: 45, sortOrder: 1 },
      { catalogKey: 'facial-peeling', name: 'Peeling químico', description: 'Renovação celular com ácidos de frutas.', iconKey: 'service.facial-peel', suggestedDurationMinutes: 40, sortOrder: 2 },
      { catalogKey: 'facial-microderm', name: 'Microdermoabrasão', description: 'Esfoliação mecânica para renovação da pele.', iconKey: 'service.facial-micro', suggestedDurationMinutes: 50, sortOrder: 3 },
      { catalogKey: 'facial-needle', name: 'Aplicação de ácidos', description: 'Protocolo com ácidos para manchas e oleosidade.', iconKey: 'service.facial-acid', suggestedDurationMinutes: 35, sortOrder: 4 },
      { catalogKey: 'facial-led', name: 'LED terapia', description: 'Luz led para colágeno e redução de acne.', iconKey: 'service.facial-led', suggestedDurationMinutes: 30, sortOrder: 5 },
      { catalogKey: 'facial-brow-lash', name: 'Combo facial completo', description: 'Limpeza + sobrancelha + cílios em uma sessão.', iconKey: 'service.facial-combo', suggestedDurationMinutes: 90, sortOrder: 6 },
    ],
  },
  {
    name: 'Maquiagem e eventos',
    icon: 'category.makeup',
    sortOrder: 8,
    items: [
      { catalogKey: 'makeup-basic', name: 'Maquiagem social', description: 'Maquiagem para ocasiões sociais e festas.', iconKey: 'service.makeup', suggestedDurationMinutes: 45, sortOrder: 0 },
      { catalogKey: 'makeup-bridal', name: 'Maquiagem de noiva', description: 'Maquiagem profissional para o grande dia.', iconKey: 'service.makeup-bridal', suggestedDurationMinutes: 90, sortOrder: 1 },
      { catalogKey: 'makeup-editorial', name: 'Maquiagem editorial', description: 'Maquiagem artística para sessões de fotos.', iconKey: 'service.makeup-editorial', suggestedDurationMinutes: 60, sortOrder: 2 },
      { catalogKey: 'makeup-party', name: 'Maquiagem de festa', description: 'Maquiagem com glitter e destaque para festas.', iconKey: 'service.makeup-party', suggestedDurationMinutes: 50, sortOrder: 3 },
      { catalogKey: 'makeup-groom', name: 'Noivo grooming', description: 'Preparação do noivo: pele, barba e cabelo.', iconKey: 'service.groom', suggestedDurationMinutes: 60, sortOrder: 4 },
      { catalogKey: 'makeup-graduation', name: 'Maquiagem formatura', description: 'Maquiagem para formaturas e cerimônias.', iconKey: 'service.makeup-grad', suggestedDurationMinutes: 50, sortOrder: 5 },
      { catalogKey: 'makeup-hair', name: 'Penteado + maquiagem', description: 'Combo de cabelo e maquiagem para eventos.', iconKey: 'service.hair-makeup', suggestedDurationMinutes: 90, sortOrder: 6 },
    ],
  },
  {
    name: 'Depilação',
    icon: 'category.waxing',
    sortOrder: 9,
    items: [
      { catalogKey: 'wax-eyebrow', name: 'Depilação sobrancelha', description: 'Depilação com cera para sobrancelha.', iconKey: 'service.wax-eyebrow', suggestedDurationMinutes: 15, sortOrder: 0 },
      { catalogKey: 'wax-chest', name: 'Depilação peito', description: 'Depilação do peito e abdômen com cera.', iconKey: 'service.wax-chest', suggestedDurationMinutes: 40, sortOrder: 1 },
      { catalogKey: 'wax-back', name: 'Depilação costas', description: 'Depilação completa das costas com cera.', iconKey: 'service.wax-back', suggestedDurationMinutes: 45, sortOrder: 2 },
      { catalogKey: 'wax-legs', name: 'Depilação pernas', description: 'Depilação das pernas com cera.', iconKey: 'service.wax-legs', suggestedDurationMinutes: 50, sortOrder: 3 },
      { catalogKey: 'wax-armpit', name: 'Depilação axilas', description: 'Depilação das axilas com cera.', iconKey: 'service.wax-armpit', suggestedDurationMinutes: 15, sortOrder: 4 },
      { catalogKey: 'wax-arms', name: 'Depilação braços', description: 'Depilação dos braços com cera.', iconKey: 'service.wax-arms', suggestedDurationMinutes: 30, sortOrder: 5 },
      { catalogKey: 'wax-face', name: 'Depilação facial', description: 'Depilação de buço e laterais do rosto.', iconKey: 'service.wax-face', suggestedDurationMinutes: 15, sortOrder: 6 },
    ],
  },
  {
    name: 'Massagem e spa',
    icon: 'category.spa',
    sortOrder: 10,
    items: [
      { catalogKey: 'massage-relax', name: 'Massagem relaxante', description: 'Massagem corporal para alívio de tensões.', iconKey: 'service.massage', suggestedDurationMinutes: 60, sortOrder: 0 },
      { catalogKey: 'massage-deep', name: 'Massagem profunda', description: 'Massagem intensiva para pontos de dor.', iconKey: 'service.massage-deep', suggestedDurationMinutes: 60, sortOrder: 1 },
      { catalogKey: 'massage-head', name: 'Massagem capilar', description: 'Massagem no couro cabeludo para circulação.', iconKey: 'service.massage-head', suggestedDurationMinutes: 30, sortOrder: 2 },
      { catalogKey: 'massage-face', name: 'Massagem facial', description: 'Massagem lifting e drenagem do rosto.', iconKey: 'service.massage-face', suggestedDurationMinutes: 40, sortOrder: 3 },
      { catalogKey: 'spa-hot-stone', name: 'Pedras quentes', description: 'Massagem com pedras basálticas aquecidas.', iconKey: 'service.spa-stone', suggestedDurationMinutes: 75, sortOrder: 4 },
      { catalogKey: 'spa-aromatherapy', name: 'Aromaterapia', description: 'Massagem com óleos essenciais relaxantes.', iconKey: 'service.spa-aroma', suggestedDurationMinutes: 60, sortOrder: 5 },
      { catalogKey: 'spa-combo', name: 'Combo spa masculino', description: 'Massagem + tratamento facial + sobrancelha.', iconKey: 'service.spa-combo', suggestedDurationMinutes: 120, sortOrder: 6 },
    ],
  },
]

async function main() {
  let categoriesCreated = 0
  let categoriesSkipped = 0
  let itemsCreated = 0
  let itemsSkipped = 0

  for (const cat of categories) {
    const existingCategory = await prisma.serviceCategory.findFirst({
      where: { name: cat.name, barbershopId: null },
    })

    let categoryId: string

    if (existingCategory) {
      categoryId = existingCategory.id
      categoriesSkipped++

      await prisma.serviceCategory.update({
        where: { id: categoryId },
        data: {
          icon: cat.icon,
          active: true,
        },
      })
    } else {
      const created = await prisma.serviceCategory.create({
        data: {
          name: cat.name,
          icon: cat.icon,
          color: null,
          barbershopId: null,
          active: true,
        },
      })
      categoryId = created.id
      categoriesCreated++
      console.log(`  ✅ Categoria criada: ${cat.name}`)
    }

    for (const item of cat.items) {
      const existingItem = await prisma.serviceCatalogItem.findUnique({
        where: { catalogKey: item.catalogKey },
      })

      if (existingItem) {
        await prisma.serviceCatalogItem.update({
          where: { id: existingItem.id },
          data: {
            name: item.name,
            description: item.description,
            iconKey: item.iconKey,
            suggestedDurationMinutes: item.suggestedDurationMinutes,
            sortOrder: item.sortOrder,
            categoryId,
            active: true,
          },
        })
        itemsSkipped++
      } else {
        await prisma.serviceCatalogItem.create({
          data: {
            catalogKey: item.catalogKey,
            categoryId,
            name: item.name,
            description: item.description,
            iconKey: item.iconKey,
            suggestedDurationMinutes: item.suggestedDurationMinutes,
            sortOrder: item.sortOrder,
            active: true,
          },
        })
        itemsCreated++
      }
    }
  }

  console.log(`\n📋 Catálogo de serviços:`)
  console.log(`   Categorias: ${categoriesCreated} criadas, ${categoriesSkipped} já existentes`)
  console.log(`   Itens: ${itemsCreated} criados, ${itemsSkipped} já existentes`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
    console.log('✅ Seed do catálogo concluído')
  })
  .catch(async (e) => {
    console.error('❌ Erro no seed do catálogo:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
