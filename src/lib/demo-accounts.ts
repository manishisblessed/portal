/**
 * In-memory demo accounts for running the portal without a database.
 * Each account has a unique role and can log in through the standard UI.
 */

export type DemoUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: string;
  status: string;
  walletBalance: number;
  allowedTabs: string[];
  enabledServices: string[];
  twoFactorEnabled: boolean;
  twoFactorExempt: boolean;
  userCode: string | null;
  shopName: string | null;
  parentId: string | null;
  tokenVersion: number;
};

export const DEMO_USERS: DemoUser[] = [
  {
    id: "demo-master-admin-001",
    name: "Masteradmin",
    email: "masteradmin@shahworks.com",
    phone: "+919090909001",
    password: "Masteradmin_9090909001",
    role: "MASTER_ADMIN",
    status: "ACTIVE",
    walletBalance: 500000,
    allowedTabs: [],
    enabledServices: [],
    twoFactorEnabled: false,
    twoFactorExempt: true,
    userCode: "SW-MA-001",
    shopName: "ShahWorks HQ",
    parentId: null,
    tokenVersion: 0,
  },
  {
    id: "demo-admin-002",
    name: "Myadmin",
    email: "admin@shahworks.com",
    phone: "+919090909002",
    password: "Admin_9090909002",
    role: "ADMIN",
    status: "ACTIVE",
    walletBalance: 100000,
    allowedTabs: [
      "users", "kyc", "billers", "commissions", "settlements",
      "invites", "audit", "sub-admins", "admins",
    ],
    enabledServices: [],
    twoFactorEnabled: false,
    twoFactorExempt: true,
    userCode: "SW-AD-002",
    shopName: "ShahWorks Admin Office",
    parentId: "demo-master-admin-001",
    tokenVersion: 0,
  },
  {
    id: "demo-super-distributor-003",
    name: "SuperDistributor",
    email: "superdistributor@shahworks.com",
    phone: "+919090909003",
    password: "SuperDistributor_9090909003",
    role: "SUPER_DISTRIBUTOR",
    status: "ACTIVE",
    walletBalance: 250000,
    allowedTabs: [],
    enabledServices: [
      "AEPS", "DMT", "UPI", "RECHARGE_MOBILE", "RECHARGE_DTH",
      "BILL_ELECTRICITY", "BILL_WATER", "BILL_GAS",
    ],
    twoFactorEnabled: false,
    twoFactorExempt: true,
    userCode: "SW-SD-003",
    shopName: "SD Enterprise",
    parentId: "demo-master-admin-001",
    tokenVersion: 0,
  },
  {
    id: "demo-master-distributor-004",
    name: "MasterDistributor",
    email: "masterdistributor@shahworks.com",
    phone: "+919090909004",
    password: "MasterDistributor_9090909004",
    role: "MASTER_DISTRIBUTOR",
    status: "ACTIVE",
    walletBalance: 150000,
    allowedTabs: [],
    enabledServices: [
      "AEPS", "DMT", "UPI", "RECHARGE_MOBILE", "RECHARGE_DTH",
      "BILL_ELECTRICITY", "BILL_WATER", "BILL_GAS",
    ],
    twoFactorEnabled: false,
    twoFactorExempt: true,
    userCode: "SW-MD-004",
    shopName: "MD Solutions",
    parentId: "demo-super-distributor-003",
    tokenVersion: 0,
  },
  {
    id: "demo-distributor-005",
    name: "Distributor",
    email: "distributor@shahworks.com",
    phone: "+919090909005",
    password: "Distributor_9090909005",
    role: "DISTRIBUTOR",
    status: "ACTIVE",
    walletBalance: 75000,
    allowedTabs: [],
    enabledServices: [
      "AEPS", "DMT", "UPI", "RECHARGE_MOBILE", "RECHARGE_DTH",
      "BILL_ELECTRICITY", "BILL_WATER", "BILL_GAS",
    ],
    twoFactorEnabled: false,
    twoFactorExempt: true,
    userCode: "SW-DT-005",
    shopName: "DT Services",
    parentId: "demo-master-distributor-004",
    tokenVersion: 0,
  },
  {
    id: "demo-retailer-006",
    name: "Retailer",
    email: "retailer@shahworks.com",
    phone: "+919090909006",
    password: "Retailer_9090909006",
    role: "RETAILER",
    status: "ACTIVE",
    walletBalance: 25000,
    allowedTabs: [],
    enabledServices: [
      "AEPS", "DMT", "UPI", "RECHARGE_MOBILE", "RECHARGE_DTH",
      "BILL_ELECTRICITY", "BILL_WATER", "BILL_GAS",
    ],
    twoFactorEnabled: false,
    twoFactorExempt: true,
    userCode: "SW-RT-006",
    shopName: "Retailer Point",
    parentId: "demo-distributor-005",
    tokenVersion: 0,
  },
];

export function findDemoUser(identifier: string): DemoUser | undefined {
  const id = identifier.trim().toLowerCase();
  const phoneNormalized = id.startsWith("+91") ? id : id.replace(/^0+/, "");
  return DEMO_USERS.find(
    (u) =>
      u.email.toLowerCase() === id ||
      u.phone === `+91${phoneNormalized}` ||
      u.phone.replace("+91", "") === phoneNormalized ||
      u.phone === phoneNormalized
  );
}

export function validateDemoPassword(user: DemoUser, password: string): boolean {
  return user.password === password;
}

export function findDemoUserById(id: string): DemoUser | undefined {
  return DEMO_USERS.find((u) => u.id === id);
}

export function isDemoMode(): boolean {
  return !process.env.DATABASE_URL;
}
