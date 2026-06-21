import { computeCampaignAnalytics } from '../../shared/campaignAnalytics.js';
import { computeCustomerSegments, PROMO_CAMPAIGNS } from '../../shared/customerSegments.js';
import { computeOrderAnalytics } from '../../shared/orderAnalytics.js';
import { computeOrderKpis } from '../../shared/orderKpis.js';
import { buildMessagingContext } from './messagingContext.js';
import { enrichDayChartTrends } from '../../shared/chartTrend.js';

export function buildBusinessSnapshot({ orders, contacts, campaignResults }) {
  const orderAnalytics = computeOrderAnalytics(orders, contacts);
  const orderKpis = computeOrderKpis(orders);
  const segments = computeCustomerSegments(contacts);
  const campaignAnalytics = computeCampaignAnalytics(campaignResults);

  const ordersChart = enrichDayChartTrends(orderAnalytics.ordersByDay, 'count', 'count');
  const revenueChart = enrichDayChartTrends(orderAnalytics.ordersByDay, 'revenue', 'count');

  return {
    generatedAt: new Date().toISOString(),
    business: 'Dolce Sicilia — artisan tiramisù delivery (Singapore, Grab)',
    orderAnalytics: {
      totalOrders: orderAnalytics.totalOrders,
      ordersThisWeek: orderAnalytics.ordersThisWeek,
      ordersThisMonth: orderAnalytics.ordersThisMonth,
      uniqueCustomers: orderAnalytics.uniqueCustomers,
      firstTimeOrders: orderAnalytics.firstTimeOrders,
      repeatOrders: orderAnalytics.repeatOrders,
      repeatRate: orderAnalytics.repeatRate,
      totalRevenue: orderAnalytics.totalRevenue,
      avgOrderValue: orderAnalytics.avgOrderValue,
      ordersWithValue: orderAnalytics.ordersWithValue,
      peakHour: orderAnalytics.peakHour,
      peakSlot: orderAnalytics.heatmapAll.peakSlot,
      repeatPeakSlot: orderAnalytics.heatmapRepeat.peakSlot,
      ordersTrend: ordersChart.summary,
      revenueTrend: revenueChart.summary,
      topCustomersBySpend: orderAnalytics.topCustomersBySpend.slice(0, 15),
      topRepeat: orderAnalytics.topRepeat.slice(0, 10),
      insights: orderAnalytics.insights,
      ordersByWeekday: orderAnalytics.ordersByWeekday,
      recentOrders: orderAnalytics.recentOrders.slice(0, 20),
      growthKpis: orderAnalytics.growthKpis,
    },
    orderKpis: {
      hero: orderKpis.hero,
      meta: orderKpis.meta,
      saturation: {
        confidence: orderKpis.saturation.confidence,
        weeksNeededForReliable: orderKpis.saturation.weeksNeededForReliable,
      },
      frequency: { identity: orderKpis.frequency.identity },
    },
    segments: segments.map((s) => ({
      id: s.id,
      name: s.name,
      who: s.who,
      count: s.contacts.length,
      contacts: s.contacts.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone?.startsWith('pending-') ? null : c.phone,
        orderCount: c.order_count,
        totalSpend: c.totalSpend,
        daysSinceOrder: c.daysSinceOrder,
        firstOrderValue: c.firstOrderValue,
        maxOrderValue: c.maxOrderValue,
        messagePref: c.message_pref || 'unset',
      })),
    })),
    promoCampaigns: PROMO_CAMPAIGNS.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      keyword: c.keyword,
    })),
    campaignFeedback: {
      enrolled: campaignAnalytics.enrolled,
      completed: campaignAnalytics.completed,
      completionRate: campaignAnalytics.completionRate,
      overallScore: campaignAnalytics.overallScore,
      questionScores: campaignAnalytics.questions?.map((q) => ({
        short: q.short,
        score: q.score,
        responses: q.responseCount,
      })),
      insights: campaignAnalytics.insights,
    },
    whatsappStats: {
      contactsWithMessages: contacts.filter((c) => (c.sentMessages?.length || 0) > 0).length,
      followupCompleted: contacts.filter((c) => c.followup_status === 'completed').length,
      activeCampaigns: contacts.filter((c) => c.campaign && !c.campaign.completed_at).length,
    },
    messaging: buildMessagingContext(contacts),
  };
}
