import { PrismaClient, Role, UserStatus, ServiceCode } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedServiceRoutes } from "../src/lib/services/catalog";

const prisma = new PrismaClient();

async function main() {
  console.log("→ Seeding ShahWorks database…");

  // ── Master Admin ──
  const masterAdminHash = await bcrypt.hash("Masteradmin_9090909001", 12);
  const masterAdmin = await prisma.user.upsert({
    where: { email: "masteradmin@shahworks.com" },
    update: { passwordHash: masterAdminHash, status: UserStatus.ACTIVE },
    create: {
      name: "Masteradmin",
      email: "masteradmin@shahworks.com",
      phone: "+919090909001",
      passwordHash: masterAdminHash,
      role: Role.MASTER_ADMIN,
      status: UserStatus.ACTIVE,
      shopName: "ShahWorks HQ"
    }
  });

  // ── Admin ──
  const adminHash = await bcrypt.hash("Admin_9090909002", 12);
  await prisma.user.upsert({
    where: { email: "admin@shahworks.com" },
    update: { passwordHash: adminHash, status: UserStatus.ACTIVE },
    create: {
      name: "Myadmin",
      email: "admin@shahworks.com",
      phone: "+919090909002",
      passwordHash: adminHash,
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      shopName: "ShahWorks Admin Office",
      parentId: masterAdmin.id
    }
  });

  // ── Super Distributor ──
  const sdHash = await bcrypt.hash("SuperDistributor_9090909003", 12);
  const demoSD = await prisma.user.upsert({
    where: { email: "superdistributor@shahworks.com" },
    update: { passwordHash: sdHash, status: UserStatus.ACTIVE },
    create: {
      name: "SuperDistributor",
      email: "superdistributor@shahworks.com",
      phone: "+919090909003",
      passwordHash: sdHash,
      role: Role.SUPER_DISTRIBUTOR,
      status: UserStatus.ACTIVE,
      walletBalance: 0,
      parentId: masterAdmin.id
    }
  });

  // ── Master Distributor ──
  const mdHash = await bcrypt.hash("MasterDistributor_9090909004", 12);
  const demoMD = await prisma.user.upsert({
    where: { email: "masterdistributor@shahworks.com" },
    update: { passwordHash: mdHash, status: UserStatus.ACTIVE },
    create: {
      name: "MasterDistributor",
      email: "masterdistributor@shahworks.com",
      phone: "+919090909004",
      passwordHash: mdHash,
      role: Role.MASTER_DISTRIBUTOR,
      status: UserStatus.ACTIVE,
      walletBalance: 0,
      parentId: demoSD.id
    }
  });

  // ── Distributor ──
  const dtHash = await bcrypt.hash("Distributor_9090909005", 12);
  const demoDT = await prisma.user.upsert({
    where: { email: "distributor@shahworks.com" },
    update: { passwordHash: dtHash, status: UserStatus.ACTIVE },
    create: {
      name: "Distributor",
      email: "distributor@shahworks.com",
      phone: "+919090909005",
      passwordHash: dtHash,
      role: Role.DISTRIBUTOR,
      status: UserStatus.ACTIVE,
      walletBalance: 0,
      parentId: demoMD.id
    }
  });

  // ── Retailer ──
  const rtHash = await bcrypt.hash("Retailer_9090909006", 12);
  await prisma.user.upsert({
    where: { email: "retailer@shahworks.com" },
    update: { passwordHash: rtHash, status: UserStatus.ACTIVE },
    create: {
      name: "Retailer",
      email: "retailer@shahworks.com",
      phone: "+919090909006",
      passwordHash: rtHash,
      role: Role.RETAILER,
      status: UserStatus.ACTIVE,
      city: "New Delhi",
      state: "Delhi",
      pincode: "110078",
      walletBalance: 0,
      parentId: demoDT.id
    }
  });

  // ── Operators (master data for recharge/bill services) ──
  const ops = [
    { service: ServiceCode.RECHARGE_MOBILE, name: "Jio", code: "JIO" },
    { service: ServiceCode.RECHARGE_MOBILE, name: "Airtel", code: "AIRTEL" },
    { service: ServiceCode.RECHARGE_MOBILE, name: "Vi", code: "VI" },
    { service: ServiceCode.RECHARGE_MOBILE, name: "BSNL", code: "BSNL" },
    { service: ServiceCode.RECHARGE_DTH, name: "Tata Play", code: "TATA_PLAY" },
    { service: ServiceCode.RECHARGE_DTH, name: "Dish TV", code: "DISH" },
    { service: ServiceCode.BILL_ELECTRICITY, name: "BSES Rajdhani", code: "BSES_R" },
    { service: ServiceCode.BILL_ELECTRICITY, name: "Tata Power Delhi", code: "TATA_DEL" },
    { service: ServiceCode.BILL_GAS, name: "Indane", code: "INDANE" },
    { service: ServiceCode.BILL_GAS, name: "HP Gas", code: "HP_GAS" }
  ];
  for (const o of ops) {
    await prisma.operator.upsert({
      where: { code: o.code },
      update: {},
      create: o
    });
  }

  // ── Service routes (On/Off Services panel) ──
  const routes = await seedServiceRoutes(prisma);
  console.log(`  Service routes: +${routes.created} new, ${routes.updated} refreshed`);

  console.log("✓ Seed complete.");
  console.log("  Master Admin:        masteradmin@shahworks.com / Masteradmin_9090909001");
  console.log("  Admin:               admin@shahworks.com / Admin_9090909002");
  console.log("  Super Distributor:   superdistributor@shahworks.com / SuperDistributor_9090909003");
  console.log("  Master Distributor:  masterdistributor@shahworks.com / MasterDistributor_9090909004");
  console.log("  Distributor:         distributor@shahworks.com / Distributor_9090909005");
  console.log("  Retailer:            retailer@shahworks.com / Retailer_9090909006");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
