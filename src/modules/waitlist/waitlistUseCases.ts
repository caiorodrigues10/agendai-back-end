import { prisma } from "@/libs/prismaClient";
import { prismaWaitlistLegado } from "./waitlistRepository";
import { AppError } from "@/shared/errors/AppError";
import {
  WaitlistRepository,
  CreateEntryData,
  UpdateEntryData,
  CreateOfferData,
  ListEntriesFilters,
} from "./waitlistRepository";

export class WaitlistUseCases {
  private repo = new WaitlistRepository();

  async createWaitlistEntry(barbershopId: string, data: CreateEntryData) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    return this.repo.createEntry({ ...data, barbershopId });
  }

  async updateWaitlistEntry(barbershopId: string, entryId: string, data: UpdateEntryData) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    if (!entryId) throw new AppError("entryId is required", 400);

    const entry = await this.repo.getEntry(entryId);
    if (!entry) throw new AppError("Waitlist entry not found", 404);
    if (entry.barbershopId !== barbershopId) throw new AppError("Access denied", 403);

    return this.repo.updateEntry(entryId, data);
  }

  async deleteWaitlistEntry(barbershopId: string, entryId: string) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    if (!entryId) throw new AppError("entryId is required", 400);

    const entry = await this.repo.getEntry(entryId);
    if (!entry) throw new AppError("Waitlist entry not found", 404);
    if (entry.barbershopId !== barbershopId) throw new AppError("Access denied", 403);

    return this.repo.deleteEntry(entryId);
  }

  async listWaitlistEntries(barbershopId: string, filters: ListEntriesFilters) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    return this.repo.listEntries(barbershopId, filters);
  }

  async offerSlot(barbershopId: string, entryId: string, data: Omit<CreateOfferData, "entryId">) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    if (!entryId) throw new AppError("entryId is required", 400);

    const entry = await this.repo.getEntry(entryId);
    if (!entry) throw new AppError("Waitlist entry not found", 404);
    if (entry.barbershopId !== barbershopId) throw new AppError("Access denied", 403);
    if (entry.status !== "ACTIVE") {
      throw new AppError(`Cannot offer slot to entry in status ${entry.status}`, 400);
    }

    return this.repo.createOffer({ ...data, entryId });
  }

  async acceptOffer(token: string) {
    if (!token) throw new AppError("token is required", 400);

    const offer = await this.repo.getOfferByToken(token);
    if (!offer) throw new AppError("Offer not found", 404);
    if (offer.status !== "PENDING") {
      throw new AppError(`Offer is already ${offer.status}`, 400);
    }
    if (offer.expiresAt && offer.expiresAt < new Date()) {
      throw new AppError("Offer has expired", 400);
    }

    await this.repo.respondToOffer(offer.id, "ACCEPTED");

    const appointment = await prisma.appointment.create({
      data: {
        barbershopId: offer.entry.barbershop?.id ?? offer.entry.barbershopId,
        serviceId: offer.entry.serviceId,
        staffId: offer.staffId,
        customerName: offer.entry.customerName,
        whatsapp: offer.entry.whatsapp ?? "",
        date: offer.offeredDate,
        time: offer.offeredTime,
        status: "CONFIRMED",
      },
    });

    await prismaWaitlistLegado.waitlistEntry.update({
      where: { id: offer.entryId },
      data: { status: "FULFILLED" },
    });

    return { offer, appointment };
  }

  async declineOffer(token: string) {
    if (!token) throw new AppError("token is required", 400);

    const offer = await this.repo.getOfferByToken(token);
    if (!offer) throw new AppError("Offer not found", 404);
    if (offer.status !== "PENDING") {
      throw new AppError(`Offer is already ${offer.status}`, 400);
    }

    await this.repo.respondToOffer(offer.id, "DECLINED");

    const pendingOffers = await prismaWaitlistLegado.waitlistOffer.count({
      where: { entryId: offer.entryId, status: "PENDING" },
    });

    if (pendingOffers === 0) {
      await prismaWaitlistLegado.waitlistEntry.update({
        where: { id: offer.entryId },
        data: { status: "ACTIVE" },
      });
    }

    return { offer };
  }

  async matchWaitlistForSlot(barbershopId: string, serviceId: string, date: Date, time: string) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);

    const candidates = await this.repo.findCandidates(barbershopId, serviceId, date, time);
    if (candidates.length === 0) return null;

    const bestCandidate = candidates[0];

    const staff = await prisma.user.findFirst({
      where: { barbershopId, role: "EMPLOYEE", active: true },
      select: { id: true },
    });

    if (!staff) return null;

    const offer = await this.repo.createOffer({
      entryId: bestCandidate.id,
      offeredDate: date,
      offeredTime: time,
      staffId: staff.id,
    });

    return { candidate: bestCandidate, offer };
  }

  async runWaitlistExpiration() {
    const expiredCount = await this.repo.expireOffers();
    return { expired: expiredCount };
  }
}
