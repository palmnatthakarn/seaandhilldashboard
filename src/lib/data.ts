import { clickhouse } from './clickhouse';

// ===== Home Dashboard =====
export async function getHomeDashboardData() {
    try {
        // ยอดขายรวม
        const salesQuery = await clickhouse.query({
            query: `
                SELECT 
                    sum(total_amount) as total_sales,
                    sumIf(total_amount, toDate(doc_datetime) = today()) as today_sales,
                    sumIf(total_amount, toYYYYMM(doc_datetime) = toYYYYMM(now())) as month_sales,
                    count(doc_no) as total_orders
                FROM saleinvoice_transaction
                WHERE status_cancel != 'Cancel'
            `,
            format: 'JSONEachRow',
        });
        const [sales] = await salesQuery.json() as any[];

        // กำไรสุทธิ (รายได้ - ค่าใช้จ่าย)
        const profitQuery = await clickhouse.query({
            query: `
                SELECT 
                    sum(if(account_code LIKE '4%', credit - debit, 0)) as revenue,
                    sum(if(account_code LIKE '5%', debit - credit, 0)) as expenses
                FROM journal_transaction_detail
                WHERE toYYYYMM(doc_datetime) = toYYYYMM(now())
            `,
            format: 'JSONEachRow',
        });
        const [profit] = await profitQuery.json() as any[];
        const netProfit = (profit?.revenue || 0) - (profit?.expenses || 0);

        // ค่าใช้จ่ายรวมเดือนนี้
        const expensesQuery = await clickhouse.query({
            query: `
                SELECT sum(total_amount) as total_expenses
                FROM purchase_transaction
                WHERE toYYYYMM(doc_datetime) = toYYYYMM(now())
            `,
            format: 'JSONEachRow',
        });
        const [expenses] = await expensesQuery.json() as any[];

        // มูลค่าสต็อก
        const stockQuery = await clickhouse.query({
            query: `
                SELECT sum(amount) as stock_value
                FROM stock_transaction
            `,
            format: 'JSONEachRow',
        });
        const [stock] = await stockQuery.json() as any[];

        return {
            todaySales: sales?.today_sales || 0,
            monthSales: sales?.month_sales || 0,
            totalOrders: sales?.total_orders || 0,
            netProfit: netProfit,
            totalExpenses: expenses?.total_expenses || 0,
            stockValue: stock?.stock_value || 0,
        };
    } catch (error) {
        console.error('Error fetching home dashboard data:', error);
        return {
            todaySales: 0,
            monthSales: 0,
            totalOrders: 0,
            netProfit: 0,
            totalExpenses: 0,
            stockValue: 0,
        };
    }
}

export async function getRevenueVsExpenseData() {
    try {
        const query = await clickhouse.query({
            query: `
                SELECT 
                    toStartOfDay(doc_datetime) as date,
                    sum(total_amount) as revenue
                FROM saleinvoice_transaction
                WHERE doc_datetime >= now() - INTERVAL 30 DAY
                GROUP BY date
                ORDER BY date ASC
            `,
            format: 'JSONEachRow',
        });
        const revenue = await query.json() as any[];

        const expenseQuery = await clickhouse.query({
            query: `
                SELECT 
                    toStartOfDay(doc_datetime) as date,
                    sum(total_amount) as expense
                FROM purchase_transaction
                WHERE doc_datetime >= now() - INTERVAL 30 DAY
                GROUP BY date
                ORDER BY date ASC
            `,
            format: 'JSONEachRow',
        });
        const expenses = await expenseQuery.json() as any[];

        // Merge revenue and expenses by date
        const dateMap = new Map();
        revenue.forEach((item: any) => {
            const dateStr = new Date(item.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
            dateMap.set(item.date, { date: dateStr, revenue: item.revenue, expense: 0 });
        });
        expenses.forEach((item: any) => {
            const existing = dateMap.get(item.date);
            if (existing) {
                existing.expense = item.expense;
            } else {
                const dateStr = new Date(item.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
                dateMap.set(item.date, { date: dateStr, revenue: 0, expense: item.expense });
            }
        });

        return Array.from(dateMap.values());
    } catch (error) {
        console.error('Error fetching revenue vs expense data:', error);
        return [];
    }
}

export async function getAlerts() {
    try {
        const alerts: any[] = [];

        // ตรวจสอบบิลค้างชำระ
        const overdueQuery = await clickhouse.query({
            query: `
                SELECT count() as count
                FROM payment_transaction
                WHERE doc_datetime < now() - INTERVAL 30 DAY
            `,
            format: 'JSONEachRow',
        });
        const [overdue] = await overdueQuery.json() as any[];
        if (overdue?.count > 0) {
            alerts.push({
                id: 'overdue-invoices',
                type: 'warning',
                title: 'บิลค้างชำระ',
                message: `มีบิลค้างชำระ ${overdue.count} รายการที่เกิน 30 วัน`,
                timestamp: new Date(),
            });
        }

        // ตรวจสอบสต็อกใกล้หมด
        const lowStockQuery = await clickhouse.query({
            query: `
                SELECT 
                    item_code,
                    item_name,
                    sum(qty) as qty
                FROM stock_transaction
                GROUP BY item_code, item_name
                HAVING qty < 10 AND qty > 0
                LIMIT 5
            `,
            format: 'JSONEachRow',
        });
        const lowStock = await lowStockQuery.json() as any[];
        if (lowStock.length > 0) {
            alerts.push({
                id: 'low-stock',
                type: 'urgent',
                title: 'สต็อกใกล้หมด',
                message: `มีสินค้า ${lowStock.length} รายการที่สต็อกเหลือน้อย`,
                timestamp: new Date(),
            });
        }

        // ตรวจสอบใบสั่งซื้อรออนุมัติ (ใบสั่งซื้อที่สร้างใหม่ภายใน 7 วัน)
        const pendingPOQuery = await clickhouse.query({
            query: `
                SELECT count() as count
                FROM purchase_transaction
                WHERE doc_datetime >= now() - INTERVAL 7 DAY
            `,
            format: 'JSONEachRow',
        });
        const [pendingPO] = await pendingPOQuery.json() as any[];
        if (pendingPO?.count > 0) {
            alerts.push({
                id: 'pending-po',
                type: 'info',
                title: 'ใบสั่งซื้อรอตรวจสอบ',
                message: `มีใบสั่งซื้อ ${pendingPO.count} รายการภายใน 7 วันที่ผ่านมา`,
                timestamp: new Date(),
            });
        }

        return alerts;
    } catch (error) {
        console.error('Error fetching alerts:', error);
        return [];
    }
}

// ===== Dashboard Stats (Legacy) =====
export async function getDashboardStats() {
    try {
        const totalSalesQuery = await clickhouse.query({
            query: `
        SELECT 
          sum(total_amount) as total_sales,
          count(doc_no) as total_orders,
          uniq(cust_code) as total_customers
        FROM saleinvoice_transaction
      `,
            format: 'JSONEachRow',
        });
        const [stats] = await totalSalesQuery.json() as [{ total_sales: number; total_orders: number; total_customers: number }];

        return {
            totalSales: stats?.total_sales || 0,
            totalOrders: stats?.total_orders || 0,
            totalCustomers: stats?.total_customers || 0,
        };
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        return { totalSales: 0, totalOrders: 0, totalCustomers: 0 };
    }
}

export async function getRecentSales() {
    try {
        const query = await clickhouse.query({
            query: `
        SELECT 
          doc_no,
          doc_datetime,
          cust_name,
          total_amount,
          status_cancel
        FROM saleinvoice_transaction
        ORDER BY doc_datetime DESC
        LIMIT 5
      `,
            format: 'JSONEachRow',
        });
        return await query.json();
    } catch (error) {
        console.error('Error fetching recent sales:', error);
        return [];
    }
}

export async function getSalesChartData() {
    try {
        const query = await clickhouse.query({
            query: `
        SELECT 
          toStartOfDay(doc_datetime) as date,
          sum(total_amount) as sales
        FROM saleinvoice_transaction
        GROUP BY date
        ORDER BY date ASC
        LIMIT 30
      `,
            format: 'JSONEachRow',
        });
        const data = await query.json();
        return data.map((item: any) => ({
            date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            sales: item.sales,
        }));
    } catch (error) {
        console.error('Error fetching sales chart data:', error);
        return [];
    }
}

export async function getSalesData(page = 1, limit = 20) {
    try {
        const offset = (page - 1) * limit;
        const query = await clickhouse.query({
            query: `
        SELECT 
          doc_no,
          doc_datetime,
          cust_code,
          cust_name,
          sale_name,
          total_amount,
          status_cancel
        FROM saleinvoice_transaction
        ORDER BY doc_datetime DESC
        LIMIT {limit:UInt32} OFFSET {offset:UInt32}
      `,
            query_params: {
                limit: limit,
                offset: offset,
            },
            format: 'JSONEachRow',
        });

        const totalQuery = await clickhouse.query({
            query: 'SELECT count() as count FROM saleinvoice_transaction',
            format: 'JSONEachRow',
        });

        const [totalResult] = await totalQuery.json() as [{ count: number }];

        return {
            data: await query.json(),
            total: totalResult.count,
            page,
            limit,
            totalPages: Math.ceil(totalResult.count / limit),
        };
    } catch (error) {
        console.error('Error fetching sales data:', error);
        return { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    }
}

export async function getInventoryData(page = 1, limit = 20) {
    try {
        const offset = (page - 1) * limit;
        const query = await clickhouse.query({
            query: `
        SELECT 
          item_code,
          item_name,
          wh_name,
          sum(qty) as current_stock,
          avg(cost) as avg_cost,
          sum(amount) as total_value
        FROM stock_transaction
        GROUP BY item_code, item_name, wh_name
        ORDER BY current_stock DESC
        LIMIT {limit:UInt32} OFFSET {offset:UInt32}
      `,
            query_params: {
                limit: limit,
                offset: offset,
            },
            format: 'JSONEachRow',
        });

        const totalQuery = await clickhouse.query({
            query: 'SELECT uniq(item_code) as count FROM stock_transaction',
            format: 'JSONEachRow',
        });

        const [totalResult] = await totalQuery.json() as [{ count: number }];

        return {
            data: await query.json(),
            total: totalResult.count,
            page,
            limit,
            totalPages: Math.ceil(totalResult.count / limit),
        };
    } catch (error) {
        console.error('Error fetching inventory data:', error);
        return { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    }
}

export async function getCustomersData(page = 1, limit = 20) {
    try {
        const offset = (page - 1) * limit;
        const query = await clickhouse.query({
            query: `
        SELECT 
          customer_code,
          customer_name,
          count(doc_no) as total_orders,
          sum(total_amount) as total_spent,
          max(doc_datetime) as last_order_date
        FROM saleinvoice_transaction
        GROUP BY customer_code, customer_name
        ORDER BY total_spent DESC
        LIMIT {limit:UInt32} OFFSET {offset:UInt32}
      `,
            query_params: {
                limit: limit,
                offset: offset,
            },
            format: 'JSONEachRow',
        });

        const totalQuery = await clickhouse.query({
            query: 'SELECT uniq(customer_code) as count FROM saleinvoice_transaction',
            format: 'JSONEachRow',
        });

        const [totalResult] = await totalQuery.json() as [{ count: number }];

        return {
            data: await query.json(),
            total: totalResult.count,
            page,
            limit,
            totalPages: Math.ceil(totalResult.count / limit),
        };
    } catch (error) {
        console.error('Error fetching customers data:', error);
        return { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    }
}
