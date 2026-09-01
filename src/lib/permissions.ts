/** Permission codes used across backend authorization checks */
export const PERMISSIONS = {
  // products
  PRODUCTS_VIEW: "products:view",
  PRODUCTS_CREATE: "products:create",
  PRODUCTS_EDIT: "products:edit",
  PRODUCTS_CHANGE_COST: "products:change_cost",
  PRODUCTS_CHANGE_PRICE: "products:change_price",
  PRODUCTS_VIEW_MARGINS: "products:view_margins",

  // stock
  STOCK_VIEW: "stock:view",
  STOCK_ADJUST: "stock:adjust",
  STOCK_INVENTORY: "stock:inventory",

  // purchases
  PURCHASES_VIEW: "purchases:view",
  PURCHASES_CREATE: "purchases:create",
  PURCHASES_EDIT: "purchases:edit",
  PURCHASES_CANCEL: "purchases:cancel",
  PURCHASES_RECEIVE: "purchases:receive",
  PURCHASES_APPROVE: "purchases:approve",

  // sales
  SALES_VIEW: "sales:view",
  SALES_CREATE: "sales:create",
  SALES_EDIT: "sales:edit",
  SALES_CANCEL: "sales:cancel",
  SALES_DISCOUNT: "sales:discount",

  // customers / crm
  CUSTOMERS_VIEW: "customers:view",
  CUSTOMERS_CREATE: "customers:create",
  CUSTOMERS_EDIT: "customers:edit",
  CRM_VIEW: "crm:view",
  CAMPAIGNS_VIEW: "campaigns:view",
  CAMPAIGNS_MANAGE: "campaigns:manage",

  // coupons
  COUPONS_VIEW: "coupons:view",
  COUPONS_MANAGE: "coupons:manage",

  // suppliers
  SUPPLIERS_VIEW: "suppliers:view",
  SUPPLIERS_MANAGE: "suppliers:manage",

  // reports & dashboards
  DASHBOARD_VIEW: "dashboard:view",
  DASHBOARD_MANAGERIAL: "dashboard:managerial",
  REPORTS_VIEW: "reports:view",
  RANKINGS_VIEW: "rankings:view",

  // users
  USERS_MANAGE: "users:manage",
  SETTINGS_MANAGE: "settings:manage",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_CODES = Object.values(PERMISSIONS);

/** Role codes */
export const ROLE_CODES = {
  ADMIN: "admin",
  MANAGER: "manager",
  SELLER: "seller",
  STOCKKEEPER: "stockkeeper",
} as const;

export const ROLE_PERMISSION_MAP: Record<string, PermissionCode[]> = {
  [ROLE_CODES.ADMIN]: ALL_PERMISSION_CODES,

  [ROLE_CODES.MANAGER]: [
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PRODUCTS_CREATE,
    PERMISSIONS.PRODUCTS_EDIT,
    PERMISSIONS.PRODUCTS_CHANGE_COST,
    PERMISSIONS.PRODUCTS_CHANGE_PRICE,
    PERMISSIONS.PRODUCTS_VIEW_MARGINS,
    PERMISSIONS.STOCK_VIEW,
    PERMISSIONS.STOCK_ADJUST,
    PERMISSIONS.STOCK_INVENTORY,
    PERMISSIONS.PURCHASES_VIEW,
    PERMISSIONS.PURCHASES_CREATE,
    PERMISSIONS.PURCHASES_EDIT,
    PERMISSIONS.PURCHASES_CANCEL,
    PERMISSIONS.PURCHASES_RECEIVE,
    PERMISSIONS.PURCHASES_APPROVE,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.SALES_CREATE,
    PERMISSIONS.SALES_EDIT,
    PERMISSIONS.SALES_CANCEL,
    PERMISSIONS.SALES_DISCOUNT,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_CREATE,
    PERMISSIONS.CUSTOMERS_EDIT,
    PERMISSIONS.CRM_VIEW,
    PERMISSIONS.CAMPAIGNS_VIEW,
    PERMISSIONS.CAMPAIGNS_MANAGE,
    PERMISSIONS.COUPONS_VIEW,
    PERMISSIONS.COUPONS_MANAGE,
    PERMISSIONS.SUPPLIERS_VIEW,
    PERMISSIONS.SUPPLIERS_MANAGE,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.DASHBOARD_MANAGERIAL,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.RANKINGS_VIEW,
    PERMISSIONS.SETTINGS_MANAGE,
  ],

  [ROLE_CODES.SELLER]: [
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.STOCK_VIEW,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.SALES_CREATE,
    PERMISSIONS.SALES_EDIT,
    PERMISSIONS.SALES_DISCOUNT,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_CREATE,
    PERMISSIONS.CUSTOMERS_EDIT,
    PERMISSIONS.CRM_VIEW,
    PERMISSIONS.COUPONS_VIEW,
    PERMISSIONS.DASHBOARD_VIEW,
  ],

  [ROLE_CODES.STOCKKEEPER]: [
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.STOCK_VIEW,
    PERMISSIONS.STOCK_ADJUST,
    PERMISSIONS.STOCK_INVENTORY,
    PERMISSIONS.PURCHASES_VIEW,
    PERMISSIONS.PURCHASES_RECEIVE,
    PERMISSIONS.SUPPLIERS_VIEW,
  ],
};

export function hasPermission(
  userPermissions: string[] | Set<string>,
  required: PermissionCode | PermissionCode[],
): boolean {
  const set =
    userPermissions instanceof Set
      ? userPermissions
      : new Set(userPermissions);
  const list = Array.isArray(required) ? required : [required];
  return list.every((p) => set.has(p));
}
