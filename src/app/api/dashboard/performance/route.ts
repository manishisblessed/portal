import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { isDemoMode, findDemoUserById } from "@/lib/demo-accounts";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAuth();

  // Demo mode: no DB — build the performance payload from the in-memory user.
  if (isDemoMode()) {
    const d = findDemoUserById(session.id);
    return NextResponse.json({
      user: {
        id: session.id,
        name: d?.name ?? session.name,
        email: d?.email ?? session.email,
        phone: d?.phone ?? session.phone,
        role: d?.role ?? session.role,
        status: d?.status ?? "ACTIVE",
        shopName: d?.shopName ?? null,
        shopAddress: null,
        pincode: null,
        state: null,
        city: null,
        walletBalance: d?.walletBalance ?? 0,
        lastLoginLat: null,
        lastLoginLng: null,
        lastLoginAt: null,
        twoFactorEnabled: true,
        createdAt: new Date().toISOString(),
        parentId: d?.parentId ?? null,
        _count: { transactions: 0, wallet: 0, children: 0 },
      },
      parentInfo: null,
      loginHistory: [],
      stats: {
        totalTransactions30d: 0,
        totalAmount30d: 0,
        successfulTxns: 0,
        failedTxns: 0,
        successRate: 0,
        networkSize: 0,
        walletTransactions: 0,
      },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      shopName: true,
      shopAddress: true,
      pincode: true,
      state: true,
      city: true,
      walletBalance: true,
      lastLoginLat: true,
      lastLoginLng: true,
      lastLoginAt: true,
      twoFactorEnabled: true,
      createdAt: true,
      parentId: true,
      _count: {
        select: {
          transactions: true,
          wallet: true,
          children: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Get recent login activity from audit logs
  const loginHistory = await prisma.auditLog.findMany({
    where: {
      userId: session.id,
      action: "user.login",
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      meta: true,
      ip: true,
      userAgent: true,
      createdAt: true,
    },
  });

  // Get transaction stats for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentTxns = await prisma.transaction.findMany({
    where: {
      userId: session.id,
      createdAt: { gte: thirtyDaysAgo },
    },
    select: {
      amount: true,
      status: true,
      createdAt: true,
    },
  });

  const totalAmount = recentTxns.reduce((sum, t) => sum + Number(t.amount), 0);
  const successfulTxns = recentTxns.filter((t) => t.status === "SUCCESS").length;
  const failedTxns = recentTxns.filter((t) => t.status === "FAILED").length;

  // Get parent info if applicable
  let parentInfo = null;
  if (user.parentId) {
    parentInfo = await prisma.user.findUnique({
      where: { id: user.parentId },
      select: { name: true, email: true, phone: true, role: true },
    });
  }

  return NextResponse.json({
    user: {
      ...user,
      walletBalance: Number(user.walletBalance),
    },
    parentInfo,
    loginHistory,
    stats: {
      totalTransactions30d: recentTxns.length,
      totalAmount30d: totalAmount,
      successfulTxns,
      failedTxns,
      successRate: recentTxns.length > 0
        ? Math.round((successfulTxns / recentTxns.length) * 100)
        : 0,
      networkSize: user._count.children,
      walletTransactions: user._count.wallet,
    },
  });
}
