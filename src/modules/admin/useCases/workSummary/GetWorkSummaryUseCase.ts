import { prisma } from "@/libs/prismaClient";

export class GetWorkSummaryUseCase {
  async execute(userId: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const [
      myOpenTickets,
      myOverdueTasks,
      myTodayTasks,
      unassignedTickets,
      recentActivity,
    ] = await Promise.all([
      // My open tickets
      prisma.ticket.findMany({
        where: {
          assignedToId: userId,
          status: { in: ["OPEN", "IN_PROGRESS", "WAITING_SHOP"] },
        },
        select: {
          id: true,
          protocol: true,
          title: true,
          priority: true,
          status: true,
          createdAt: true,
          barbershop: { select: { name: true } },
        },
        orderBy: [
          { priority: "desc" },
          { createdAt: "asc" },
        ],
        take: 10,
      }),

      // My overdue tasks
      prisma.task.findMany({
        where: {
          assignedToId: userId,
          status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] },
          dueDate: { lt: now },
        },
        select: {
          id: true,
          title: true,
          priority: true,
          status: true,
          dueDate: true,
          barbershop: { select: { name: true } },
        },
        orderBy: [
          { priority: "desc" },
          { dueDate: "asc" },
        ],
        take: 10,
      }),

      // My tasks due today
      prisma.task.findMany({
        where: {
          assignedToId: userId,
          status: { in: ["TODO", "IN_PROGRESS"] },
          dueDate: { gte: todayStart, lt: tomorrowStart },
        },
        select: {
          id: true,
          title: true,
          priority: true,
          status: true,
          dueDate: true,
        },
        orderBy: [
          { priority: "desc" },
          { dueDate: "asc" },
        ],
        take: 10,
      }),

      // Unassigned open tickets
      prisma.ticket.findMany({
        where: {
          status: { in: ["OPEN", "WAITING_SHOP"] },
          assignedToId: null,
        },
        select: {
          id: true,
          protocol: true,
          title: true,
          priority: true,
          status: true,
          channel: true,
          createdAt: true,
          barbershop: { select: { name: true } },
        },
        orderBy: [
          { priority: "desc" },
          { createdAt: "asc" },
        ],
        take: 10,
      }),

      // Recent activity related to this user
      prisma.ticketHistory.findMany({
        where: {
          ticket: {
            OR: [
              { assignedToId: userId },
              { createdById: userId },
            ],
          },
        },
        select: {
          id: true,
          field: true,
          oldValue: true,
          newValue: true,
          createdAt: true,
          actor: { select: { name: true } },
          ticket: { select: { protocol: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
    ]);

    // Counts
    const [
      totalOpenTickets,
      totalInProgressTickets,
      myActiveTasks,
      myCompletedToday,
    ] = await Promise.all([
      prisma.ticket.count({
        where: { assignedToId: userId, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_SHOP"] } },
      }),
      prisma.ticket.count({
        where: { assignedToId: userId, status: "IN_PROGRESS" },
      }),
      prisma.task.count({
        where: { assignedToId: userId, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } },
      }),
      prisma.task.count({
        where: {
          assignedToId: userId,
          status: "DONE",
          completedAt: { gte: todayStart },
        },
      }),
    ]);

    return {
      summary: {
        totalOpenTickets,
        totalInProgressTickets,
        totalMyActiveTasks: myActiveTasks,
        totalCompletedToday: myCompletedToday,
        unassignedCount: unassignedTickets.length,
      },
      myOpenTickets,
      myOverdueTasks,
      myTodayTasks,
      unassignedTickets,
      recentActivity,
    };
  }
}
