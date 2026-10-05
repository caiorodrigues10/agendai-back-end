import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";
import { OrganizationRepository } from "../../organizationRepository";
import { requestContext } from "@/shared/infra/http/requestContext";
import { utcDateFromYmd } from "@/modules/barbershops/utils/getShopOpenState";
import type { OrgAccessLevel } from "@/shared/utils/organizationAccess";
import {
  computeShopOpenState,
  ymdInTimeZone,
  weekdayInTimeZone,
  minutesInTimeZone,
  timeToMinutes,
  addDaysYmd,
} from "@/modules/barbershops/utils/shopOpenState";

export interface OrgDashboardShopDTO {
  barbershopId: string;
  name: string;
  logoUrl: string | null;
  isOpen: boolean;
  accessLevel: "FULL" | "OPERATIONAL";
  /** = waitingCount + inServiceCount (mantido por compatibilidade com quem já consome). */
  liveNow: number;
  /** QueueItem.status === "WAITING" com joinedAt de hoje no fuso do salão. */
  waitingCount: number;
  /**
   * QueueItem.status === "IN_CHAIR" (hoje, no fuso do salão) + Appointment
   * CONFIRMED dentro da janela start <= agora < start + avgTimeMinutes.
   */
  inServiceCount: number;
  /** Ausente quando accessLevel = OPERATIONAL (faturamento é dado sensível). */
  revenue?: { today: number; week: number; month: number };
}

/** Campos do salão usados pelo dashboard — todos já vieram de `org.barbershops`. */
type SalaoDaOrg = {
  id: string;
  name: string;
  logoUrl: string | null;
  timezone: string | null;
  manualStatus: "AUTO" | "OPEN" | "CLOSED";
  manualStatusSetAt: Date | null;
  openingMode: "SCHEDULE" | "MANUAL";
  queueClosedAt: Date | null;
};

/** Janelas de tempo resolvidas no fuso do salão (antes calculadas dentro do loop). */
type Calendario = {
  shop: SalaoDaOrg;
  tz: string;
  todayYmd: string;
  /** Meia-noite UTC do "hoje" do salão — mesmo valor usado no filtro `date` da agenda. */
  todayDate: Date;
  weekday: number;
  weekStartYmd: string;
  monthStartYmd: string;
  rangeStart: Date;
  nowMinutes: number;
};

type LinhaFila = { barbershopId: string; joinedAt: Date; status: string };
type LinhaAgenda = {
  barbershopId: string;
  date: Date;
  time: string;
  service: { avgTimeMinutes: number } | null;
};
type LinhaEscala = {
  barbershopId: string;
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
};
type LinhaConcluida = {
  barbershopId: string;
  completedAt: Date | null;
  finalPrice: number | null;
  service: { price: number } | null;
};

/** Resultado do lote único, já indexado por salão. */
type DadosDoLote = {
  fila: Map<string, LinhaFila[]>;
  agenda: Map<string, LinhaAgenda[]>;
  escalas: Map<string, LinhaEscala>;
  concluidos: Map<string, LinhaConcluida[]>;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function agruparPor<T>(rows: T[], chave: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = chave(row);
    const atual = map.get(key);
    if (atual) atual.push(row);
    else map.set(key, [row]);
  }
  return map;
}

/**
 * Executa um lote de leituras multi-salão com `app.current_barbershop_id` vazio.
 *
 * A policy `tenant_isolation` é `current = '' OR barbershopId = current`: com GUC vazio
 * ela libera todas as linhas, e o `barbershopId IN (ids)` do WHERE restringe o resultado
 * à união exata das leituras que antes rodavam uma a uma dentro de `withShopContext`
 * (cada salão com o seu próprio GUC). Só entra aqui `id` de salão cujo acesso já foi
 * resolvido como != NONE nesta request.
 */
function noContextoVazio<T>(fn: () => Promise<T>): Promise<T> {
  return requestContext.run({ barbershopId: "" }, fn);
}

export class GetOrganizationDashboardUseCase {
  private repo = new OrganizationRepository();

  /**
   * Dashboard agregado multiunidades: para cada salão ativo da organização,
   * devolve estado ao vivo (fila + agenda de hoje no fuso do salão, isOpen) e,
   * para quem tem acesso FULL, o faturamento (QueueItem.finalPrice, COMPLETED,
   * por completedAt) de hoje / semana corrente / mês corrente no fuso do salão.
   *
   * - Organização inexistente → 404 (mesmo padrão de OrganizationUseCases.getById).
   * - Requisitante sem nenhuma relação com a org → 403 (idem getById).
   * - Salão com access NONE é omitido da lista (não derruba a org inteira).
   *
   * Custa 5-6 consultas Prisma por request, independente do número de salões:
   * findById + lote de acesso (1) + lote de dados (4, sendo o 4º só com FULL).
   * Antes eram 3 consultas de acesso + 4-5 de dados POR salão (~25 para 3 unidades).
   *
   * `_sessionBarbershopId` permanece na assinatura por compatibilidade com o controller:
   * o contexto RLS da sessão não é mais trocado por salão — o lote roda com GUC vazio
   * e escopo explícito por `IN (ids)` (ver `noContextoVazio`).
   */
  async execute(
    organizationId: string,
    userId: string,
    role: string,
    _sessionBarbershopId?: string
  ): Promise<OrgDashboardShopDTO[]> {
    const org = await this.repo.findById(organizationId);
    if (!org) throw new AppError("Organização não encontrada", 404);

    const isMember = org.ownerId === userId || org.members.some((m: any) => m.userId === userId);
    if (!isMember) throw new AppError("Sem acesso a esta organização", 403);

    const now = new Date();
    const shops = (org.barbershops as SalaoDaOrg[]).filter((s: any) => s.active);
    if (shops.length === 0) return [];

    const acessos = await this.resolveAcessos(shops, userId, role, org.members ?? []);
    const calendarios = shops
      .filter((shop) => acessos.get(shop.id) !== "NONE")
      .map((shop) => this.buildCalendario(shop, now));
    if (calendarios.length === 0) return [];

    const dados = await this.loadLote(calendarios, acessos, now);

    return calendarios
      .map((cal) => this.buildShopEntry(cal, acessos, dados, now))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Nível de acesso de todos os salões em lote — antes eram até 3 consultas POR salão
   * (`resolveOrgAccessToBarbershop`). Equivalência comprovada:
   *
   * - `MASTER_ADMIN` continua caindo no atalho sem nenhuma consulta.
   * - O `findFirst` de dono rodava SEM `withShopContext` (contexto RLS da sessão);
   *   o `findMany` com `barbershopId IN (ids)` mantém esse mesmo contexto, então devolve
   *   exatamente os salões em que o `findFirst` por salão devolveria linha: mesmo WHERE
   *   (id, papel, ativo, não deletado) e mesma visibilidade da policy `tenant_isolation`
   *   sobre a tabela `users`.
   * - O `barbershop.findUnique` que buscava `organizationId` some: todo salão aqui veio
   *   de `org.barbershops`, cujo `organizationId` é a própria organização já validada no
   *   `isMember` acima — `organizationId` nulo é impossível nesse caminho.
   * - O `organizationMember.findUnique` some: `org.members` já vem do `findById`
   *   (`organization_members` não tem RLS), ou seja, é o mesmo registro e o mesmo papel.
   */
  private async resolveAcessos(
    shops: SalaoDaOrg[],
    userId: string,
    role: string,
    members: Array<{ userId: string; role: string }>
  ): Promise<Map<string, OrgAccessLevel>> {
    const acessos = new Map<string, OrgAccessLevel>();
    if (shops.length === 0) return acessos;

    if (role === "MASTER_ADMIN") {
      for (const shop of shops) acessos.set(shop.id, "FULL");
      return acessos;
    }

    const owners = await prisma.user.findMany({
      where: {
        id: userId,
        barbershopId: { in: shops.map((shop) => shop.id) },
        role: "OWNER",
        active: true,
        deletedAt: null,
      },
      select: { barbershopId: true },
    });
    const donoDe = new Set(
      owners.map((owner) => owner.barbershopId).filter((id): id is string => Boolean(id))
    );
    const papel = members.find((member) => member.userId === userId)?.role;

    for (const shop of shops) {
      if (donoDe.has(shop.id)) acessos.set(shop.id, "FULL");
      else if (!papel) acessos.set(shop.id, "NONE");
      else if (papel === "OWNER" || papel === "ADMIN") acessos.set(shop.id, "FULL");
      else acessos.set(shop.id, "OPERATIONAL");
    }
    return acessos;
  }

  /** Janelas de tempo por salão (hoje/semana/mês no fuso do próprio salão). */
  private buildCalendario(shop: SalaoDaOrg, now: Date): Calendario {
    const tz = shop.timezone || "America/Sao_Paulo";
    const todayYmd = ymdInTimeZone(now, tz);
    // Semana corrente: segunda-feira → domingo, no fuso do salão.
    const weekday = weekdayInTimeZone(utcDateFromYmd(todayYmd), "UTC");
    const weekStartYmd = addDaysYmd(todayYmd, -((weekday + 6) % 7));
    const monthStartYmd = `${todayYmd.slice(0, 8)}01`;
    // Limite inferior das buscas: o início mais antigo entre semana e mês.
    // `utcDateFromYmd` é meia-noite UTC do YMD — conservador (umas horas antes da
    // meia-noite local); o bucketing por `ymdInTimeZone` depois ajusta com precisão.
    const rangeStartYmd = weekStartYmd < monthStartYmd ? weekStartYmd : monthStartYmd;
    const todayDate = utcDateFromYmd(todayYmd);

    return {
      shop,
      tz,
      todayYmd,
      todayDate,
      weekday,
      weekStartYmd,
      monthStartYmd,
      rangeStart: utcDateFromYmd(rangeStartYmd),
      nowMinutes: minutesInTimeZone(now, tz),
    };
  }

  /**
   * Quatro consultas para TODOS os salões visíveis — antes eram 4-5 consultas por salão
   * (fila, agenda, `getShopOpenState`×2 e concluídos). Cada filtro é refeito por salão em
   * memória com os MESMOS limites que iam para o WHERE individual, para que a janela
   * conservadora do lote (o menor início entre os salões) não desloque nenhum número:
   *
   * - fila: `joinedAt >= utcDateFromYmd(hojeDoSalão)` + `ymdInTimeZone === hojeDoSalão`;
   * - agenda: `date === utcDateFromYmd(hojeDoSalão)` (o `IN` do lote cobre todos os "hoje");
   * - concluídos: `completedAt >= rangeStartDoSalão` e `<= now` (o `lte: now` é global).
   *
   * As escalas entram como 1 `findMany` em vez de 1 `findUnique` por salão.
   */
  private async loadLote(
    calendarios: Calendario[],
    acessos: Map<string, OrgAccessLevel>,
    now: Date
  ): Promise<DadosDoLote> {
    const ids = calendarios.map((cal) => cal.shop.id);
    const datasDeHoje = [...new Map(calendarios.map((cal) => [cal.todayDate.getTime(), cal.todayDate])).values()];
    const diasDaSemana = [...new Set(calendarios.map((cal) => cal.weekday))];
    const menorInicioDoDia = new Date(
      Math.min(...calendarios.map((cal) => cal.todayDate.getTime()))
    );
    const full = calendarios.filter((cal) => acessos.get(cal.shop.id) === "FULL");
    const fullIds = full.map((cal) => cal.shop.id);
    const menorRangeStart = full.length
      ? new Date(Math.min(...full.map((cal) => cal.rangeStart.getTime())))
      : null;

    const [filaRows, agendaRows, escalaRows, concluidaRows] = await noContextoVazio(() =>
      Promise.all([
        prisma.queueItem.findMany({
          where: {
            barbershopId: { in: ids },
            status: { in: ["WAITING", "IN_CHAIR"] },
            joinedAt: { gte: menorInicioDoDia },
          },
          select: { barbershopId: true, joinedAt: true, status: true },
        }),
        prisma.appointment.findMany({
          where: {
            barbershopId: { in: ids },
            status: "CONFIRMED",
            date: { in: datasDeHoje },
          },
          select: {
            barbershopId: true,
            date: true,
            time: true,
            service: { select: { avgTimeMinutes: true } },
          },
        }),
        prisma.schedule.findMany({
          where: { barbershopId: { in: ids }, dayOfWeek: { in: diasDaSemana } },
          select: {
            barbershopId: true,
            dayOfWeek: true,
            isOpen: true,
            openTime: true,
            closeTime: true,
          },
        }),
        // Faturamento é dado sensível: só os salões com acesso FULL têm as linhas lidas.
        fullIds.length > 0 && menorRangeStart
          ? prisma.queueItem.findMany({
              where: {
                barbershopId: { in: fullIds },
                status: "COMPLETED",
                completedAt: { gte: menorRangeStart, lte: now },
              },
              select: {
                barbershopId: true,
                completedAt: true,
                finalPrice: true,
                service: { select: { price: true } },
              },
            })
          : Promise.resolve([]),
      ])
    );

    const escalas = new Map<string, LinhaEscala>();
    for (const escala of escalaRows) {
      escalas.set(`${escala.barbershopId}:${escala.dayOfWeek}`, escala);
    }

    return {
      fila: agruparPor(filaRows as LinhaFila[], (row) => row.barbershopId),
      agenda: agruparPor(agendaRows as LinhaAgenda[], (row) => row.barbershopId),
      escalas,
      concluidos: agruparPor(concluidaRows as LinhaConcluida[], (row) => row.barbershopId),
    };
  }

  private buildShopEntry(
    cal: Calendario,
    acessos: Map<string, OrgAccessLevel>,
    dados: DadosDoLote,
    now: Date
  ): OrgDashboardShopDTO {
    const { shop, tz, todayYmd, todayDate, weekday, weekStartYmd, monthStartYmd, nowMinutes } = cal;
    const access = acessos.get(shop.id) ?? "NONE";

    const queueToday = (dados.fila.get(shop.id) ?? []).filter(
      (row) => row.joinedAt >= todayDate && ymdInTimeZone(row.joinedAt, tz) === todayYmd
    );
    const waitingCount = queueToday.filter((row) => row.status === "WAITING").length;
    // Agenda de hoje (data calendário no fuso do salão), só CONFIRMED — duas
    // DECISÕES EXPLÍCITAS registradas aqui:
    // 1) CHECKED_IN saiu do filtro: o CheckInAppointmentUseCase SEMPRE cria um
    //    QueueItem IN_CHAIR vinculado ao agendamento, então quem foi checkado já
    //    está representado na fila — contá-lo também na agenda seria contar a
    //    mesma pessoa DUAS vezes no card (bug corrigido).
    //    INVARIANTE: CheckInAppointmentUseCase é o ÚNICO escritor de status
    //    CHECKED_IN e roda inteiro em prisma.$transaction, criando o QueueItem
    //    IN_CHAIR (com appointmentId) ANTES de marcar o Appointment; os branches
    //    de duplicata/erro dão throw antes de qualquer escrita. Verificar esse
    //    use case antes de alterar qualquer um dos dois arquivos.
    // 2) "Já começou e ainda não passou do fim previsto" é filtrado abaixo, usando
    //    time + service.avgTimeMinutes (fallback 30min, mesma convenção do conflito
    //    de agenda em appointmentUseCases): um CONFIRMED esquecido há horas NÃO
    //    conta como ao vivo indefinidamente. liveNow é a "verdade ao vivo" dos cards;
    //    o sinal de "atendimento que deveria ter fechado e não fechou" fica na tela
    //    de fila/agenda, não aqui.
    const todayAppointments = (dados.agenda.get(shop.id) ?? []).filter(
      (row) => row.date.getTime() === todayDate.getTime()
    );
    const inServiceCount =
      queueToday.filter((row) => row.status === "IN_CHAIR").length +
      todayAppointments.filter((appointment) => {
        const start = timeToMinutes(appointment.time);
        const end = start + (appointment.service?.avgTimeMinutes ?? 30);
        return start <= nowMinutes && nowMinutes < end;
      }).length;
    const liveNow = waitingCount + inServiceCount;

    const escala = dados.escalas.get(`${shop.id}:${weekday}`) ?? null;
    const openState = computeShopOpenState({
      now,
      timeZone: tz,
      dateYmd: todayYmd,
      manualStatus: shop.manualStatus,
      manualStatusSetAt: shop.manualStatusSetAt,
      openingMode: shop.openingMode,
      queueClosedAt: shop.queueClosedAt,
      weekly: escala
        ? { isOpen: escala.isOpen, openTime: escala.openTime, closeTime: escala.closeTime }
        : null,
    });

    const entry: OrgDashboardShopDTO = {
      barbershopId: shop.id,
      name: shop.name,
      logoUrl: shop.logoUrl,
      isOpen: openState.open,
      accessLevel: access === "FULL" ? "FULL" : "OPERATIONAL",
      liveNow,
      waitingCount,
      inServiceCount,
    };

    if (access === "FULL") {
      // Mesma fonte de receita do GetBarbershopInsightsUseCase: QueueItem.finalPrice
      // com fallback pro preço do serviço, status COMPLETED, por completedAt.
      const revenue = { today: 0, week: 0, month: 0 };
      for (const row of dados.concluidos.get(shop.id) ?? []) {
        // Reaplica por salão o `completedAt >= rangeStart` que saiu do WHERE individual:
        // o lote parte do menor rangeStart entre os salões (fusos podem divergir).
        if (!row.completedAt || row.completedAt < cal.rangeStart) continue;
        const price = row.finalPrice ?? row.service?.price ?? 0;
        const ymd = ymdInTimeZone(row.completedAt, tz);
        if (ymd >= monthStartYmd) revenue.month += price;
        if (ymd >= weekStartYmd) revenue.week += price;
        if (ymd === todayYmd) revenue.today += price;
      }
      entry.revenue = {
        today: round2(revenue.today),
        week: round2(revenue.week),
        month: round2(revenue.month),
      };
    }

    return entry;
  }
}
