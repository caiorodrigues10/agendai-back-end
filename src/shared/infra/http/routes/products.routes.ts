import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { checkProductsInventoryAccess } from "../middlewares/checkProductsInventoryAccess";
import { setRlsContext } from "../middlewares/setRlsContext";
import { ProductsController } from "@/modules/products/controllers/ProductsController";

export async function productsRoutes(app: FastifyInstance) {
  const controller = new ProductsController();
  const guard = [
    authenticate,
    authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]),
    checkSubscription,
    checkProductsInventoryAccess,
    setRlsContext,
  ];

  app.get("/products", { preHandler: guard }, controller.listProducts.bind(controller));
  app.post("/products", { preHandler: guard }, controller.createProduct.bind(controller));
  app.patch("/products/:id", { preHandler: guard }, controller.updateProduct.bind(controller));
  app.get("/products/reports", { preHandler: guard }, controller.reports.bind(controller));

  app.get("/product-categories", { preHandler: guard }, controller.listCategories.bind(controller));
  app.post("/product-categories", { preHandler: guard }, controller.createCategory.bind(controller));
  app.patch("/product-categories/:id", { preHandler: guard }, controller.updateCategory.bind(controller));

  app.get("/suppliers", { preHandler: guard }, controller.listSuppliers.bind(controller));
  app.post("/suppliers", { preHandler: guard }, controller.createSupplier.bind(controller));
  app.patch("/suppliers/:id", { preHandler: guard }, controller.updateSupplier.bind(controller));

  app.get("/inventory/movements", { preHandler: guard }, controller.listMovements.bind(controller));
  app.get("/inventory/receipts", { preHandler: guard }, controller.listReceipts.bind(controller));
  app.post("/inventory/receipts", { preHandler: guard }, controller.createReceipt.bind(controller));
  app.post("/inventory/receipts/:id/reverse", { preHandler: guard }, controller.reverseReceipt.bind(controller));
  app.post("/inventory/adjustments", { preHandler: guard }, controller.adjustStock.bind(controller));

  app.get("/retail-sales", { preHandler: guard }, controller.listSales.bind(controller));
  app.post("/retail-sales", { preHandler: guard }, controller.createSale.bind(controller));
  app.get("/retail-sales/:id", { preHandler: guard }, controller.getSale.bind(controller));
  app.post("/retail-sales/:id/refunds", { preHandler: guard }, controller.refundSale.bind(controller));

  app.get("/barbershops/:id/catalog-template", { preHandler: guard }, controller.previewTemplate.bind(controller));
  app.post("/barbershops/:id/catalog-template/install", { preHandler: guard }, controller.installTemplate.bind(controller));
}
