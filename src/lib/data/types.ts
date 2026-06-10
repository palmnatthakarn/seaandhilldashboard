// TypeScript Types and Interfaces for MIS Dashboard

// ============================================
// Common Types
// ============================================

export interface DateRange {
  start: string; // ISO date string (YYYY-MM-DD)
  end: string;   // ISO date string (YYYY-MM-DD)
}

export interface KPIData {
  value: number;
  previousValue?: number;
  growth?: number;
  growthPercentage?: number;
  trend?: 'up' | 'down' | 'neutral';
}

export interface ChartDataPoint {
  date: string;
  value: number;
  [key: string]: string | number;
}

// ============================================
// Accounting Types
// ============================================

export interface AccountingKPIs {
  assets: KPIData;
  liabilities: KPIData;
  equity: KPIData;
  revenue: KPIData;
  expenses: KPIData;
}

export interface ProfitLossData {
  month: string;
  revenue: number;
  expenses: number;
  netProfit: number;
}

export interface BalanceSheetItem {
  accountType: string;
  account_type?: string; // For filtering (ASSETS, LIABILITIES, EQUITY)
  typeName: string;
  accountCode: string;
  accountName: string;
  balance: number;
}

export interface CashFlowData {
  activityType: 'Operating' | 'Investing' | 'Financing';
  revenue: number;
  expenses: number;
  netCashFlow: number;
}

export interface AgingItem {
  code: string;
  name: string;
  docNo: string;
  docDate: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  daysOverdue: number;
  agingBucket: string;
}

export interface CategoryBreakdown {
  accountGroup: string;
  accountName: string;
  amount: number;
  percentage: number;
}

export interface ProductAccountData {
  categoryCode: string;
  categoryName: string;
  accountType: 'INCOME' | 'EQUITY' | 'EXPENSES';
  accountCode: string;
  accountName: string;
  revenue: number;
  equity: number;
  expenses: number;
}

export interface AccountProductItem {
  docDate: string;
  docNo: string;
  accountCode?: string;
  accountName?: string;
  bookName: string;
  branchName: string;
  debit: number;
  credit: number;
  amount: number;
  itemCode: string;
  itemName: string;
  categoryCode: string;
  categoryName: string;
  unitCode: string;
  qty: number;
  price: number;
  itemAmount: number;
}

export interface ChartOfAccountItem {
  accountCode: string;
  accountName: string;
  accountType: string;
  netAmount: number;
  docCount: number;
}

// ============================================
// Sales Types
// ============================================

export interface SalesKPIs {
  totalSales: KPIData;
  grossProfit: KPIData;
  totalOrders: KPIData;
  avgOrderValue: KPIData;
  grossMarginPct?: number;
}

export interface SalesTrendData {
  date: string;
  sales: number;
  orderCount: number;
  avgOrderValue?: number;
}

export interface TopProduct {
  itemCode: string;
  itemName: string;
  brandName: string;
  categoryName: string;
  totalQtySold: number;
  totalSales: number;
  totalProfit: number;
  profitMarginPct: number;
}

export interface SalesByBranch {
  branchCode: string;
  branchName: string;
  orderCount: number;
  totalSales: number;
}

export interface SalesBySalesperson {
  saleCode: string;
  saleName: string;
  orderCount: number;
  totalSales: number;
  avgOrderValue: number;
  customerCount: number;
}

export interface TopCustomer {
  customerCode: string;
  customerName: string;
  orderCount: number;
  totalSpent: number;
  avgOrderValue: number;
  lastOrderDate: string;
  daysSinceLastOrder: number;
}

export interface ARStatus {
  statusPayment: string;
  invoiceCount: number;
  totalInvoiceAmount: number;
  totalPaid: number;
  totalOutstanding: number;
}

export interface SalesAnalysisData {
  categoryName: string;
  docDate: string;
  docNo: string;
  itemCode: string;
  itemName: string;
  unitCode: string;
  qty: number;
  price: number;
  discountAmount: number;
  totalAmount: number;
}

export interface SalesByCategory {
  branchName: string;
  categoryCode: string;
  categoryName: string;
  itemCode: string;
  itemName: string;
  orderCount: number;
  totalQtySold: number;
  totalSales: number;
  totalProfit: number;
  profitMarginPct: number;
}

// ============================================
// Purchase Types
// ============================================

export interface PurchaseKPIs {
  totalPurchases: KPIData;
  totalItemsPurchased: KPIData;
  totalPOCount: KPIData;
  totalOrders: KPIData;
  avgPOValue: KPIData;
  avgOrderValue: KPIData;
  apOutstanding: KPIData;
}

export interface PurchaseTrendData {
  month: string;
  totalPurchases: number;
  poCount: number;
  avgPOValue?: number;
}

export interface TopSupplier {
  supplierCode: string;
  supplierName: string;
  poCount: number;
  totalPurchases: number;
  avgPOValue: number;
  lastPurchaseDate: string;
}

export interface PurchaseAnalysisData {
  categoryName: string;
  docDate: string;
  docNo: string;
  itemCode: string;
  itemName: string;
  unitCode: string;
  qty: number;
  price: number;
  totalAmount: number;
}

export interface PurchaseByCategory {
  categoryCode: string;
  categoryName: string;
  itemCode: string;
  itemName: string;
  totalQty: number;
  totalPurchaseValue: number;
  uniqueItems?: number;
  orderCount?: number;
}

export interface PurchaseByBrand {
  brandCode: string;
  brandName: string;
  totalPurchaseValue: number;
  uniqueItems?: number;
}

export interface APOutstanding {
  supplierCode: string;
  supplierName: string;
  totalOutstanding: number;
  overdueAmount: number;
  docCount: number;
}

export interface APOutstandingItem {
  supplierCode: string;
  supplierName: string;
  docNo: string;
  dueDate: string;
  outstanding: number;
  daysOverdue: number;
  statusPayment: string;
}

export interface AveragePurchasePrice {
  itemCode: string;
  itemName: string;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  supplierCount: number;
  totalQtyPurchased?: number;
}

// Purchase + Journal Types
export interface SupplierPODetail {
  docDate: string;
  docNo: string;
  supplierCode: string;
  supplierName: string;
  accountCode: string;
  accountName: string;
  categoryCode: string;
  categoryName: string;
  itemCode: string;
  itemName: string;
  unitCode: string;
  qty: number;
  price: number;
  totalAmount: number;
}

export interface PurchaseAccountData {
  categoryCode: string;
  categoryName: string;
  accountType: 'EXPENSES' | 'ASSETS' | 'LIABILITIES';
  accountCode: string;
  accountName: string;
  expenses: number;
  assets: number;
  liabilities: number;
  totalPurchaseValue: number;
  totalQty: number;
}

export interface PurchaseChartOfAccountItem {
  accountCode: string;
  accountName: string;
  accountType: string;
  netAmount: number;
  docCount: number;
}

export interface PurchaseItemsByAccount {
  docDate: string;
  docNo: string;
  itemCode: string;
  itemName: string;
  categoryCode: string;
  categoryName: string;
  brandName: string;
  unitCode: string;
  qty: number;
  price: number;
  totalAmount: number;
}

// ============================================
// Inventory Types
// ============================================

export interface InventoryKPIs {
  totalInventoryValue: KPIData;
  totalItems: KPIData;
  totalItemsInStock: KPIData;
  lowStockItems: KPIData;
  lowStockAlerts: KPIData;
  overstockItems: KPIData;
  overstockAlerts: KPIData;
}

export interface StockMovement {
  date: string;
  qtyIn: number;
  qtyOut: number;
  valueIn?: number;
  valueOut?: number;
}

export interface StockMovementData {
  date: string;
  qtyIn: number;
  qtyOut: number;
  valueIn: number;
  valueOut: number;
}

export interface StockByWarehouse {
  whCode: string;
  whName: string;
  uniqueItems: number;
  totalQty: number;
  totalValue: number;
}

export interface LowStockItem {
  itemCode: string;
  itemName: string;
  brandName: string;
  categoryName: string;
  whName: string;
  branchName: string;
  currentStock: number;
  qtyOnHand: number;
  stockValue: number;
  avgDailySales: number;
  daysOnHand: number;
}

export interface OverstockItem {
  itemCode: string;
  itemName: string;
  brandName: string;
  categoryName: string;
  unitCode: string;
  branchName: string;
  currentStock: number;
  qtyOnHand: number;
  stockValue: number;
  avgDailySales: number;
  daysOnHand: number;
}

export interface SlowMovingItem {
  itemCode: string;
  itemName: string;
  brandName: string;
  categoryName: string;
  currentStock: number;
  qtyOnHand: number;
  costAvg: number;
  stockValue: number;
  inventoryValue: number;
  qtySold: number;
  daysOfStock: number;
  lastSaleDate?: string | null;
  daysSinceLastSale?: number | null;
}

export interface InventoryTurnover {
  itemCode: string;
  itemName: string;
  categoryName: string;
  totalCOGS: number;
  avgInventoryValue: number;
  turnoverRatio: number;
  daysInventoryOutstanding: number;
  daysToSell: number;
}

export interface StockByBranch {
  branchCode: string;
  branchName: string;
  inventoryValue: number;
  itemCount: number;
  qtyOnHand?: number;
}

export interface ABCItem {
  itemCode: string;
  itemName: string;
  brandName: string;
  categoryName: string;
  totalSalesValue: number;
  salesPct: number;
  cumulativePct: number;
  abcClass: 'A' | 'B' | 'C';
  qtyOnHand: number;
  stockValue: number;
  avgDailySales: number;
}

// ============================================
// Permission Types
// ============================================

export interface Permission {
  componentId: string; // "accounting.kpi.assets"
  action: 'view' | 'export';
  granted: boolean;
}

export interface Role {
  roleId: string;
  roleName: string;
  description: string;
  permissions: Permission[];
}

export interface User {
  userId: string;
  email: string;
  name: string;
  roles: string[];
}

// ============================================
// API Response Types
// ============================================

export interface APIResponse<T> {
  data: T;
  success: boolean;
  error?: string;
  timestamp?: string;
}

export interface APIError {
  message: string;
  statusCode: number;
  details?: unknown;
}

// ============================================
// Filter Types
// ============================================

export interface FilterOptions {
  branches?: { code: string; name: string }[];
  salespersons?: { code: string; name: string }[];
  suppliers?: { code: string; name: string }[];
  categories?: { code: string; name: string }[];
  brands?: { code: string; name: string }[];
  warehouses?: { code: string; name: string }[];
}
