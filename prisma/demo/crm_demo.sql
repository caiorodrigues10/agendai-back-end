\set ON_ERROR_STOP on
\if :{?agendai_demo_seed}
\else
  \echo 'Use: psql -v agendai_demo_seed=yes -f prisma/demo/crm_demo.sql "$DATABASE_URL"'
  \quit
\endif
\if :agendai_demo_seed
\else
  \echo 'A variável agendai_demo_seed precisa ser yes/on.'
  \quit
\endif

BEGIN;

DO $$
BEGIN
  IF current_database() ILIKE '%prod%' THEN
    RAISE EXCEPTION 'Seed CRM Demo bloqueado em banco de produção';
  END IF;
  IF EXISTS (SELECT 1 FROM barbershops WHERE id = 'd0000000-0000-4000-8000-000000000001'::uuid AND name <> 'AgendAI CRM Demo') THEN
    RAISE EXCEPTION 'UUID de demo já pertence a outro salão; abortando';
  END IF;
END $$;

DELETE FROM barbershops WHERE id = 'd0000000-0000-4000-8000-000000000001'::uuid AND name = 'AgendAI CRM Demo';

INSERT INTO barbershops (id, name, whatsapp, address, city, latitude, longitude, active, "approvalStatus", "createdAt", "updatedAt")
VALUES ('d0000000-0000-4000-8000-000000000001', 'AgendAI CRM Demo', '11999990000', 'Rua da Demonstração, 100', 'São Paulo', -23.5505, -46.6333, true, 'APPROVED', now() - interval '18 months', now());

INSERT INTO users (id, name, email, password, role, cpf, "barbershopId", active, permissions, "createdAt", "updatedAt") VALUES
('d1000000-0000-4000-8000-000000000001', 'Dona Demo', 'demo.owner@agendai.local', '$2a$10$7EqJtq98hPqEX7fNZaFWoOeXLh1aY9vvGZsY9X2gkPv.E.A7wwk6a', 'OWNER', '52998224725', 'd0000000-0000-4000-8000-000000000001', true, ARRAY['CRM_ANALYTICS_VIEW','CRM_CAMPAIGNS_MANAGE'], now() - interval '18 months', now()),
('d1000000-0000-4000-8000-000000000002', 'Ana Profissional', 'demo.ana@agendai.local', '$2a$10$7EqJtq98hPqEX7fNZaFWoOeXLh1aY9vvGZsY9X2gkPv.E.A7wwk6a', 'EMPLOYEE', '11144477735', 'd0000000-0000-4000-8000-000000000001', true, ARRAY['CLIENTS_MANAGE'], now() - interval '18 months', now()),
('d1000000-0000-4000-8000-000000000003', 'Bruno Profissional', 'demo.bruno@agendai.local', '$2a$10$7EqJtq98hPqEX7fNZaFWoOeXLh1aY9vvGZsY9X2gkPv.E.A7wwk6a', 'EMPLOYEE', '98765432100', 'd0000000-0000-4000-8000-000000000001', true, ARRAY['CLIENTS_MANAGE','CRM_ANALYTICS_VIEW'], now() - interval '18 months', now());

INSERT INTO schedules (id, "barbershopId", "dayOfWeek", "isOpen", "openTime", "closeTime")
SELECT gen_random_uuid(), 'd0000000-0000-4000-8000-000000000001'::uuid, day, day BETWEEN 2 AND 6, '09:00', CASE WHEN day IN (5,6) THEN '20:00' ELSE '19:00' END
FROM generate_series(0, 6) AS day;

INSERT INTO service_categories (id, "barbershopId", name, active, "createdAt", "updatedAt") VALUES
('d2000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Cabelo', true, now(), now()),
('d2000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'Estética', true, now(), now());

INSERT INTO services (id, "barbershopId", "categoryId", name, price, "avgTimeMinutes", icon, active, "commissionPercent", "createdAt", "updatedAt") VALUES
('d3000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Corte',55,40,'scissors',true,35,now(),now()),
('d3000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Corte + Barba',85,60,'sparkles',true,40,now(),now()),
('d3000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','Sobrancelha',30,20,'star',true,30,now(),now());

INSERT INTO salon_clients (id, "barbershopId", name, whatsapp, "normalizedWhatsapp", "marketingOptIn", "marketingOptInAt", "marketingOptInSource", "createdAt", "updatedAt")
SELECT ('d4000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'd0000000-0000-4000-8000-000000000001'::uuid,
       'Cliente Demo ' || lpad(n::text, 3, '0'),
       '1198' || lpad(n::text, 7, '0'),
       '1198' || lpad(n::text, 7, '0'),
       n % 4 <> 0,
       CASE WHEN n % 4 <> 0 THEN now() - ((n % 400) || ' days')::interval ELSE NULL END,
       CASE WHEN n % 4 <> 0 THEN 'demo_sql' ELSE NULL END,
       now() - ((550 - n % 500) || ' days')::interval,
       now()
FROM generate_series(1, 250) AS n;

-- 18 meses de movimento: sexta/sábado fortes; chuva derruba a demanda e o ticket.
INSERT INTO queue (id, "barbershopId", "serviceId", "customerId", "clientId", "customerName", whatsapp, "joinedAt", "calledAt", status, "completedAt", "completedBy", "finalPrice", "paymentMethod", "addedByStaff")
SELECT gen_random_uuid(),
       'd0000000-0000-4000-8000-000000000001'::uuid,
       CASE WHEN v.n % 5 = 0 THEN 'd3000000-0000-4000-8000-000000000002'::uuid WHEN v.n % 7 = 0 THEN 'd3000000-0000-4000-8000-000000000003'::uuid ELSE 'd3000000-0000-4000-8000-000000000001'::uuid END,
       gen_random_uuid(),
       ('d4000000-0000-4000-8000-' || lpad(((extract(day from d.day)::int + v.n * 7) % 250 + 1)::text, 12, '0'))::uuid,
       'Cliente Demo ' || lpad(((extract(day from d.day)::int + v.n * 7) % 250 + 1)::text, 3, '0'),
       '1198' || lpad(((extract(day from d.day)::int + v.n * 7) % 250 + 1)::text, 7, '0'),
       d.day + time '10:00' + (v.n || ' hours')::interval,
       d.day + time '10:12' + (v.n || ' hours')::interval,
       'COMPLETED',
       d.day + time '10:40' + (v.n || ' hours')::interval,
       CASE WHEN v.n % 2 = 0 THEN 'd1000000-0000-4000-8000-000000000002'::uuid ELSE 'd1000000-0000-4000-8000-000000000003'::uuid END,
       CASE WHEN v.n % 5 = 0 THEN 85 WHEN v.n % 7 = 0 THEN 30 ELSE 55 END * CASE WHEN d.rain THEN .85 ELSE 1 END,
       CASE WHEN v.n % 17 = 0 THEN 'fiado' ELSE CASE WHEN v.n % 3 = 0 THEN 'pix' ELSE 'credit_card' END END,
       true
FROM (
  SELECT day::date AS day, (extract(dow from day) IN (5,6) OR random() < .12) AS busy, random() < .22 AS rain
  FROM generate_series(current_date - interval '18 months', current_date - interval '1 day', interval '1 day') day
) d
CROSS JOIN LATERAL generate_series(1, CASE WHEN d.busy THEN 7 ELSE 3 END) v(n)
WHERE extract(dow from d.day) NOT IN (0,1);

INSERT INTO commission_entries (id, "barbershopId", "queueItemId", "serviceId", "professionalId", percentage, amount, "createdAt")
SELECT gen_random_uuid(), q."barbershopId", q.id, q."serviceId", q."completedBy",
       s."commissionPercent", round((q."finalPrice" * s."commissionPercent" / 100)::numeric, 2), q."completedAt"
FROM queue q JOIN services s ON s.id = q."serviceId"
WHERE q."barbershopId" = 'd0000000-0000-4000-8000-000000000001'::uuid;

INSERT INTO appointments (id, "barbershopId", "serviceId", "staffId", "clientId", "customerName", whatsapp, date, time, status, "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001',
       CASE WHEN n % 2 = 0 THEN 'd1000000-0000-4000-8000-000000000002'::uuid ELSE 'd1000000-0000-4000-8000-000000000003'::uuid END,
       ('d4000000-0000-4000-8000-' || lpad(((n * 3) % 250 + 1)::text,12,'0'))::uuid,
       'Cliente Demo ' || lpad(((n * 3) % 250 + 1)::text,3,'0'), '1198' || lpad(((n * 3) % 250 + 1)::text,7,'0'),
       current_date + ((n % 14) || ' days')::interval, '14:00', 'CONFIRMED', now(), now()
FROM generate_series(1, 35) n;

INSERT INTO service_packages (id, "barbershopId", "serviceId", name, "sessionCount", price, "validityDays", active, "createdAt", "updatedAt") VALUES
('d5000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','5 cortes',5,240,180,true,now(),now());
INSERT INTO client_packages (id, "barbershopId", "clientId", "packageId", "serviceId", "totalSessions", "remainingSessions", "pricePaid", "paymentMethod", status, "purchasedAt", "expiresAt", "soldById", "createdAt", "updatedAt")
SELECT gen_random_uuid(),'d0000000-0000-4000-8000-000000000001',('d4000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'d5000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001',5,(n%5),240,'pix','ACTIVE',current_date - ((n*11)%400 || ' days')::interval,current_date + interval '90 days','d1000000-0000-4000-8000-000000000002',now(),now() FROM generate_series(1,45) n;

INSERT INTO fiados (id, "barbershopId", "clientId", "customerName", whatsapp, description, "originalAmount", "paidAmount", status, "dueDate", "createdById", notes, "createdAt", "updatedAt")
SELECT ('d6000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'d0000000-0000-4000-8000-000000000001',('d4000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'Cliente Demo '||lpad(n::text,3,'0'),'1198'||lpad(n::text,7,'0'),'Atendimento fiado demo',85,CASE WHEN n%2=0 THEN 30 ELSE 0 END,CASE WHEN n%2=0 THEN 'PARTIAL' ELSE 'PENDING' END,current_date + interval '10 days','d1000000-0000-4000-8000-000000000001','Seed CRM Demo',current_date - ((n*12)%120 || ' days')::interval,now() FROM generate_series(1,24) n;
INSERT INTO fiado_payments (id, "fiadoId", amount, "registeredById", "createdAt") SELECT gen_random_uuid(),id,30,'d1000000-0000-4000-8000-000000000001',"createdAt" + interval '7 days' FROM fiados WHERE "barbershopId"='d0000000-0000-4000-8000-000000000001' AND "paidAmount">0;

INSERT INTO expenses (id, "barbershopId", title, amount, type, recurrence, "referenceDate", "createdById", "createdAt", "updatedAt")
SELECT gen_random_uuid(),'d0000000-0000-4000-8000-000000000001','Custos operacionais demo',850 + (extract(month from m)::int * 12),'VARIABLE','MONTHLY',m::date,'d1000000-0000-4000-8000-000000000001',m,now() FROM generate_series(date_trunc('month', current_date - interval '18 months'), date_trunc('month', current_date), interval '1 month') m;

INSERT INTO daily_weather_logs (id, "barbershopId", date, "temperatureMax", "temperatureMin", "precipitationMm", "precipitationPct", "weatherCode", "conditionText", "windSpeedMax", humidity, "queueCount", "appointmentCount", revenue, "revenuePerCapita")
SELECT gen_random_uuid(),'d0000000-0000-4000-8000-000000000001',day::date,28,19,CASE WHEN extract(dow from day) IN (2,4) THEN 12 ELSE 1 END,CASE WHEN extract(dow from day) IN (2,4) THEN 75 ELSE 15 END,CASE WHEN extract(dow from day) IN (2,4) THEN 63 ELSE 1 END,CASE WHEN extract(dow from day) IN (2,4) THEN 'Chuva moderada' ELSE 'Ensolarado' END,15,65,coalesce((SELECT count(*) FROM queue q WHERE q."barbershopId"='d0000000-0000-4000-8000-000000000001' AND q."completedAt"::date=day::date),0),0,coalesce((SELECT sum(q."finalPrice") FROM queue q WHERE q."barbershopId"='d0000000-0000-4000-8000-000000000001' AND q."completedAt"::date=day::date),0),0 FROM generate_series(current_date - interval '18 months', current_date - interval '1 day', interval '1 day') day;

-- Eventos imutáveis do CRM: serviço recebido/fiado, pacote vendido e pagamentos de fiado.
INSERT INTO crm_financial_events (id, "barbershopId", "clientId", kind, "sourceType", "sourceId", "grossAmount", "receivedAmount", "outstandingDelta", "occurredAt")
SELECT gen_random_uuid(),q."barbershopId",q."clientId",'SERVICE_COMPLETED','queue',q.id,q."finalPrice",CASE WHEN q."paymentMethod"='fiado' THEN 0 ELSE q."finalPrice" END,CASE WHEN q."paymentMethod"='fiado' THEN q."finalPrice" ELSE 0 END,q."completedAt" FROM queue q WHERE q."barbershopId"='d0000000-0000-4000-8000-000000000001';
INSERT INTO crm_financial_events (id, "barbershopId", "clientId", kind, "sourceType", "sourceId", "grossAmount", "receivedAmount", "outstandingDelta", "occurredAt") SELECT gen_random_uuid(),"barbershopId","clientId",'PACKAGE_SOLD','client_package',id,"pricePaid","pricePaid",0,"purchasedAt" FROM client_packages WHERE "barbershopId"='d0000000-0000-4000-8000-000000000001';
INSERT INTO crm_financial_events (id, "barbershopId", "clientId", kind, "sourceType", "sourceId", "grossAmount", "receivedAmount", "outstandingDelta", "occurredAt") SELECT gen_random_uuid(),f."barbershopId",f."clientId",'FIADO_PAYMENT','fiado_payment',p.id,0,p.amount,-p.amount,p."createdAt" FROM fiado_payments p JOIN fiados f ON f.id=p."fiadoId" WHERE f."barbershopId"='d0000000-0000-4000-8000-000000000001';

COMMIT;
\echo 'CRM Demo criado. Login: demo.owner@agendai.local / password (hash padrão de demonstração).'
