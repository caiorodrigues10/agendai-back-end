-- Agenda: consultas de disponibilidade/conflito por salão + profissional + dia + status
CREATE INDEX IF NOT EXISTS "appointments_barbershopId_staffId_date_status_idx"
ON "appointments"("barbershopId", "staffId", "date", "status");
