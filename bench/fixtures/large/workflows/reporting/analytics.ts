/**
 * Analytics reporting workflows for large fixture.
 */

import { proxyActivities, sleep } from '@temporalio/workflow';

import type { Order, PaginatedResult, PaginationParams, User } from '../../types';
import { groupBy } from '../../utils';

interface AnalyticsActivities {
  getOrdersInRange(
    start: Date,
    end: Date,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Order>>;
  getUsersInRange(
    start: Date,
    end: Date,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<User>>;
  calculateRevenue(orders: Order[]): Promise<number>;
  calculateAverageOrderValue(orders: Order[]): Promise<number>;
  getTopProducts(
    orders: Order[],
    limit: number,
  ): Promise<Array<{ productId: string; revenue: number; quantity: number }>>;
  saveReport(reportType: string, data: Record<string, unknown>): Promise<string>;
  sendReportEmail(reportId: string, recipients: string[]): Promise<void>;
  logAnalytics(action: string, details: string): Promise<void>;
}

const activities = proxyActivities<AnalyticsActivities>({
  startToCloseTimeout: '10 minutes',
});

interface SalesReport {
  period: { start: Date; end: Date };
  totalRevenue: number;
  orderCount: number;
  averageOrderValue: number;
  topProducts: Array<{ productId: string; revenue: number; quantity: number }>;
}

export async function generateSalesReportWorkflow(
  startDate: Date,
  endDate: Date,
): Promise<SalesReport> {
  await activities.logAnalytics(
    'sales_report',
    `${startDate.toISOString()} - ${endDate.toISOString()}`,
  );

  // Fetch all orders in range
  const allOrders: Order[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const result = await activities.getOrdersInRange(startDate, endDate, {
      page,
      pageSize: 100,
    });
    allOrders.push(...result.items);
    hasMore = result.hasMore;
    page++;
  }

  // Calculate metrics
  const revenue = await activities.calculateRevenue(allOrders);
  const aov = await activities.calculateAverageOrderValue(allOrders);
  const topProducts = await activities.getTopProducts(allOrders, 10);

  const report: SalesReport = {
    period: { start: startDate, end: endDate },
    totalRevenue: revenue,
    orderCount: allOrders.length,
    averageOrderValue: aov,
    topProducts,
  };

  // Save report
  const reportId = await activities.saveReport(
    'sales',
    report as unknown as Record<string, unknown>,
  );
  await activities.logAnalytics('sales_report_saved', reportId);

  return report;
}

interface UserActivityReport {
  period: { start: Date; end: Date };
  newUsers: number;
  activeUsers: number;
  usersByRole: Record<string, number>;
}

export async function generateUserActivityReportWorkflow(
  startDate: Date,
  endDate: Date,
): Promise<UserActivityReport> {
  await activities.logAnalytics(
    'user_report',
    `${startDate.toISOString()} - ${endDate.toISOString()}`,
  );

  // Fetch all users in range
  const allUsers: User[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const result = await activities.getUsersInRange(startDate, endDate, {
      page,
      pageSize: 100,
    });
    allUsers.push(...result.items);
    hasMore = result.hasMore;
    page++;
  }

  // Group by role
  const byRole = groupBy(allUsers, 'role');
  const usersByRole: Record<string, number> = {};
  for (const [role, users] of byRole) {
    usersByRole[String(role)] = users.length;
  }

  const report: UserActivityReport = {
    period: { start: startDate, end: endDate },
    newUsers: allUsers.length,
    activeUsers: allUsers.filter((u) => u.status === 'active').length,
    usersByRole,
  };

  const reportId = await activities.saveReport(
    'user_activity',
    report as unknown as Record<string, unknown>,
  );
  await activities.logAnalytics('user_report_saved', reportId);

  return report;
}

export async function scheduledDailyReportWorkflow(recipients: string[]): Promise<void> {
  // Run daily
  while (true) {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Generate and send sales report
    const salesReport = await generateSalesReportWorkflow(yesterday, now);
    const salesReportId = await activities.saveReport(
      'daily_sales',
      salesReport as unknown as Record<string, unknown>,
    );
    await activities.sendReportEmail(salesReportId, recipients);

    // Wait until next day
    await sleep('24 hours');
  }
}

export async function scheduledWeeklyReportWorkflow(recipients: string[]): Promise<void> {
  // Run weekly
  while (true) {
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Generate reports
    const salesReport = await generateSalesReportWorkflow(lastWeek, now);
    const userReport = await generateUserActivityReportWorkflow(lastWeek, now);

    // Combine into weekly summary
    const weeklyReportId = await activities.saveReport('weekly_summary', {
      sales: salesReport,
      users: userReport,
    });

    await activities.sendReportEmail(weeklyReportId, recipients);

    // Wait until next week
    await sleep('7 days');
  }
}
