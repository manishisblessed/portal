import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createMobileToken, createSessionGrant } from "@/lib/auth-server";
import { createTempToken } from "@/lib/two-factor";
import {
  findDemoUser,
  validateDemoPassword,
  isDemoMode,
} from "@/lib/demo-accounts";
import {
  logSecurityEvent,
  detectLoginAnomalies,
  deviceHash,
  clientIp,
} from "@/lib/security/audit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { getLoginBlock } from "@/lib/security/accountGate";

const LocationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracy: z.number().optional(),
});

const Body = z.object({
  identifier: z.string().min(3).max(120),
  password: z.string().min(1).max(200),
  location: LocationSchema,
  captchaToken: z.string().max(4000).optional(),
  // Optional role assertion. When the public login form sends this, the
  // credentials must match a user whose role equals it — otherwise we return
  // the same generic "Invalid credentials" so an attacker can never learn a
  // real account's role. Admin/staff login pages omit this field and are
  // unaffected.
  role: z
    .enum(["RETAILER", "DISTRIBUTOR", "MASTER_DISTRIBUTOR", "SUPER_DISTRIBUTOR"])
    .optional(),
});

/**
 * POST /api/auth/login
 * Step 1 of login — validates email/phone + password, with brute-force
 * lockout, IP+identifier rate limiting, optional CAPTCHA, and login-anomaly
 * detection. Never reveals whether the identifier exists.
 *
 * If 2FA is enabled: returns { needs2FA: true, tempToken } — no session issued.
 * If 2FA is NOT enabled: returns { needs2FA: false, needsSetup: true }.
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent") || "unknown";

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Location verification is required. Please allow location access." },
      { status: 400 }
    );
  }

  const { identifier, password, location, captchaToken, role: assertedRole } = parsed.data;

  // ── Demo mode: authenticate against in-memory accounts ──
  if (isDemoMode()) {
    const demoUser = findDemoUser(identifier);
    if (!demoUser || !validateDemoPassword(demoUser, password)) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (assertedRole && demoUser.role !== assertedRole) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const loginBlock = getLoginBlock(demoUser.status);
    if (loginBlock) {
      return NextResponse.json(
        { error: loginBlock.error, code: loginBlock.code },
        { status: 403 }
      );
    }

    // Demo mode routes every user through the standard 2FA screen. There is no
    // database to hold a per-user TOTP secret, so /api/auth/2fa/verify-session
    // accepts any valid demo code (see verifyDemo2FACode) and issues the grant.
    const tempToken = createTempToken(demoUser.id);
    return NextResponse.json({
      ok: true,
      needs2FA: true,
      needsSetup: false,
      tempToken,
      user: {
        id: demoUser.id,
        name: demoUser.name,
        email: demoUser.email,
        role: demoUser.role,
      },
    });
  }

  // ── Database mode: full auth with Prisma ──
  let prisma: any;
  let enforceRateLimit: any;
  let RATE_LIMITS: any;
  let assertNotLocked: any;
  let recordFailedLogin: any;
  let recordSuccessfulLogin: any;
  let recentFailureCount: any;
  let normalizeIdentifier: any;
  let assertCaptcha: any;

  try {
    const dbMod = await import("@/lib/db");
    prisma = dbMod.prisma;
    const rlMod = await import("@/lib/security/rateLimit");
    enforceRateLimit = rlMod.enforceRateLimit;
    RATE_LIMITS = rlMod.RATE_LIMITS;
    const lockMod = await import("@/lib/security/lockout");
    assertNotLocked = lockMod.assertNotLocked;
    recordFailedLogin = lockMod.recordFailedLogin;
    recordSuccessfulLogin = lockMod.recordSuccessfulLogin;
    recentFailureCount = lockMod.recentFailureCount;
    normalizeIdentifier = lockMod.normalizeIdentifier;
    const captchaMod = await import("@/lib/security/captcha");
    assertCaptcha = captchaMod.assertCaptcha;
  } catch {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  const normalized = normalizeIdentifier(identifier);

  try {
    await enforceRateLimit(`login:ip:${ip}`, RATE_LIMITS.login);
    await enforceRateLimit(`login:id:${normalized}`, RATE_LIMITS.login);
    await assertCaptcha(captchaToken, ip);
    await assertNotLocked(normalized);
  } catch (e) {
    return toErrorResponse(e);
  }

  try {
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: normalized }, { phone: normalized }], deletedAt: null },
    });

    const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;

    if (!user || !valid) {
      const { failedCount, locked, lockedUntil } = await recordFailedLogin(normalized, ip);
      await logSecurityEvent({
        action: "auth.login_failed",
        severity: locked ? "danger" : "warn",
        userId: user?.id ?? null,
        entity: "User",
        entityId: user?.id ?? null,
        ip,
        userAgent,
        meta: { identifier: normalized, failedCount, locked, lockedUntil: lockedUntil?.toISOString() ?? null },
      });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (assertedRole && user.role !== assertedRole) {
      await logSecurityEvent({
        action: "auth.login_role_mismatch",
        severity: "warn",
        userId: user.id,
        entity: "User",
        entityId: user.id,
        ip,
        userAgent,
        meta: { attemptedRole: assertedRole, actualRole: user.role },
      });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const loginBlock = getLoginBlock(user.status);
    if (loginBlock) {
      await logSecurityEvent({
        action: "auth.login_blocked",
        severity: "warn",
        userId: user.id,
        entity: "User",
        entityId: user.id,
        ip,
        userAgent,
        meta: { reason: loginBlock.code },
      });
      return NextResponse.json(
        { error: loginBlock.error, code: loginBlock.code },
        { status: 403 }
      );
    }

    const priorFailures = await recentFailureCount(normalized);
    await recordSuccessfulLogin(normalized);

    const anomalies = detectLoginAnomalies({
      lastLoginLat: user.lastLoginLat,
      lastLoginLng: user.lastLoginLng,
      lastLoginAt: user.lastLoginAt,
      knownDevices: user.knownDevices ?? [],
      lat: location.lat,
      lng: location.lng,
      userAgent,
      recentFailures: priorFailures,
    });

    const device = deviceHash(userAgent);
    const knownDevices = Array.from(new Set([...(user.knownDevices ?? []), device])).slice(-10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginLat: location.lat,
        lastLoginLng: location.lng,
        lastLoginAt: new Date(),
        lastLoginIp: ip,
        lastLoginUserAgent: userAgent.slice(0, 512),
        knownDevices,
      },
    });

    await logSecurityEvent({
      action: "auth.login",
      severity: anomalies.flagged ? "danger" : "info",
      userId: user.id,
      entity: "User",
      entityId: user.id,
      ip,
      userAgent,
      meta: {
        lat: location.lat,
        lng: location.lng,
        accuracy: location.accuracy,
        anomalies,
      },
    });

    if (user.twoFactorExempt && user.pinLoginEnabled && user.txnPinHash) {
      const tempToken = createTempToken(user.id);
      return NextResponse.json({
        ok: true,
        needsPinLogin: true,
        needs2FA: false,
        needsSetup: false,
        riskAccepted: Boolean(user.pinLoginRiskAcceptedAt),
        tempToken,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    }

    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const tempToken = createTempToken(user.id);
      return NextResponse.json({
        ok: true,
        needs2FA: true,
        needsSetup: false,
        tempToken,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    }

    const sessionUser = {
      id: user.id,
      userCode: (user as { userCode?: string | null }).userCode ?? null,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      walletBalance: Number(user.walletBalance),
      allowedTabs: user.allowedTabs ?? [],
      enabledServices: user.enabledServices ?? [],
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorExempt: user.twoFactorExempt,
    };

    const token = createMobileToken(sessionUser);
    const grant = createSessionGrant(user.id);

    return NextResponse.json({
      ok: true,
      needs2FA: false,
      needsSetup: true,
      token,
      grant,
      user: sessionUser,
    });
  } catch (err) {
    console.error("[auth/login] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error. Please try again." },
      { status: 500 }
    );
  }
}
