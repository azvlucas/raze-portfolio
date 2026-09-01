import { getSession } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { ProductsClient } from "./products-client";

export default async function ProdutosPage() {
  const session = await getSession();
  const canViewMargins = hasPermission(
    session.user?.permissions ?? [],
    PERMISSIONS.PRODUCTS_VIEW_MARGINS,
  );

  return <ProductsClient canViewMargins={canViewMargins} />;
}
