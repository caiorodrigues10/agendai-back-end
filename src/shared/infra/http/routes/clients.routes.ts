import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { setRlsContext } from "../middlewares/setRlsContext";
import { ClientController } from "@/modules/clients/controllers/ClientController";
import { ProcedureRecordController } from "@/modules/clients/controllers/ProcedureRecordController";
import { PetController } from "@/modules/clients/controllers/PetController";
import { VehicleController } from "@/modules/clients/controllers/VehicleController";

export async function clientsRoutes(app: FastifyInstance) {
  const clients = new ClientController();
  const procedures = new ProcedureRecordController();
  const pets = new PetController();
  const vehicles = new VehicleController();
  const staffGuard = [
    authenticate,
    authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]),
    checkSubscription,
    setRlsContext,
  ];

  app.post("/clients", { preHandler: staffGuard }, clients.create.bind(clients));
  app.get("/clients", { preHandler: staffGuard }, clients.list.bind(clients));
  app.get("/clients/:id", { preHandler: staffGuard }, clients.get.bind(clients));
  app.patch("/clients/:id", { preHandler: staffGuard }, clients.update.bind(clients));
  app.delete("/clients/:id", { preHandler: staffGuard }, clients.delete.bind(clients));

  // Procedure records
  app.get("/clients/:id/procedures", { preHandler: staffGuard }, procedures.list.bind(procedures));
  app.get("/clients/:id/procedures/latest", { preHandler: staffGuard }, procedures.latest.bind(procedures));
  app.post("/clients/:id/procedures", { preHandler: staffGuard }, procedures.create.bind(procedures));
  app.patch("/clients/:id/procedures/:recordId", { preHandler: staffGuard }, procedures.update.bind(procedures));
  app.delete("/clients/:id/procedures/:recordId", { preHandler: staffGuard }, procedures.delete.bind(procedures));

  // Pets (MVP petshop)
  app.get("/clients/:id/pets", { preHandler: staffGuard }, pets.list.bind(pets));
  app.post("/clients/:id/pets", { preHandler: staffGuard }, pets.create.bind(pets));
  app.patch("/clients/:id/pets/:petId", { preHandler: staffGuard }, pets.update.bind(pets));
  app.delete("/clients/:id/pets/:petId", { preHandler: staffGuard }, pets.delete.bind(pets));

  // Veículos (MVP automotivo: lava jato e oficina)
  app.get("/clients/:id/vehicles", { preHandler: staffGuard }, vehicles.list.bind(vehicles));
  app.post("/clients/:id/vehicles", { preHandler: staffGuard }, vehicles.create.bind(vehicles));
  app.patch("/clients/:id/vehicles/:vehicleId", { preHandler: staffGuard }, vehicles.update.bind(vehicles));
  app.delete("/clients/:id/vehicles/:vehicleId", { preHandler: staffGuard }, vehicles.delete.bind(vehicles));
}
