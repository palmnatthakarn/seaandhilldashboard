import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  findManagedUserByEmail,
  isBootstrapAdmin,
  normalizeBranches,
  normalizeEmail,
  requireAdminUser,
  type AppRole,
} from "@/lib/auth-policy";
import { authDbClient, ensureAuthUserPolicyColumns } from "@/lib/auth-db";

function isRole(value: unknown): value is AppRole {
  return value === "admin" || value === "user";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function readEnabled(value: unknown, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

async function assertAdmin() {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  return null;
}

export async function GET() {
  const denied = await assertAdmin();
  if (denied) return denied;

  await ensureAuthUserPolicyColumns();

  const result = await authDbClient.execute('SELECT * FROM "user" ORDER BY updatedAt DESC');
  const users = await Promise.all(
    result.rows.map(async (row) => findManagedUserByEmail(String(row.email)))
  );

  return NextResponse.json({
    success: true,
    data: users.filter(Boolean),
  });
}

export async function POST(request: NextRequest) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const email = normalizeEmail(typeof body?.email === "string" ? body.email : null);

  if (!email) {
    return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 });
  }

  const role = isRole(body?.role) ? body.role : "user";
  const branches = normalizeBranches(isStringArray(body?.allowed_branches) ? body.allowed_branches : []);
  const enabled = readEnabled(body?.enabled, true);
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : email.split("@")[0];
  const now = new Date().toISOString();

  await ensureAuthUserPolicyColumns();

  const existing = await findManagedUserByEmail(email);
  if (existing) {
    return NextResponse.json(
      { success: false, error: "User already exists" },
      { status: 409 }
    );
  }

  await authDbClient.execute({
    sql: `
      INSERT INTO "user" (
        id, name, email, emailVerified, image, createdAt, updatedAt, role, enabled, allowed_branches
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      randomUUID(),
      name,
      email,
      1,
      null,
      now,
      now,
      role,
      enabled ? 1 : 0,
      JSON.stringify(branches),
    ],
  });

  return NextResponse.json({
    success: true,
    data: await findManagedUserByEmail(email),
  });
}

export async function PATCH(request: NextRequest) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const currentEmail = normalizeEmail(
    typeof body?.currentEmail === "string"
      ? body.currentEmail
      : typeof body?.email === "string"
        ? body.email
        : null
  );
  const nextEmail = normalizeEmail(typeof body?.email === "string" ? body.email : currentEmail);

  if (!currentEmail || !nextEmail) {
    return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 });
  }

  const existing = await findManagedUserByEmail(currentEmail);
  if (!existing) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }

  if (isBootstrapAdmin(currentEmail) && currentEmail !== nextEmail) {
    return NextResponse.json(
      { success: false, error: "Bootstrap admin email cannot be changed" },
      { status: 400 }
    );
  }

  if (currentEmail !== nextEmail && await findManagedUserByEmail(nextEmail)) {
    return NextResponse.json(
      { success: false, error: "Email already exists" },
      { status: 409 }
    );
  }

  const name = typeof body?.name === "string" && body.name.trim()
    ? body.name.trim()
    : existing.name;
  const role = isRole(body?.role) ? body.role : existing.role;
  const branches = normalizeBranches(
    isStringArray(body?.allowed_branches) ? body.allowed_branches : existing.allowed_branches
  );
  const enabled = isBootstrapAdmin(currentEmail) ? true : readEnabled(body?.enabled, existing.enabled);

  await authDbClient.execute({
    sql: `
      UPDATE "user"
      SET name = ?, email = ?, role = ?, enabled = ?, allowed_branches = ?, updatedAt = ?
      WHERE email = ?
    `,
    args: [
      name,
      nextEmail,
      role,
      enabled ? 1 : 0,
      JSON.stringify(branches),
      new Date().toISOString(),
      currentEmail,
    ],
  });

  return NextResponse.json({
    success: true,
    data: await findManagedUserByEmail(nextEmail),
  });
}

export async function DELETE(request: NextRequest) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const email = normalizeEmail(typeof body?.email === "string" ? body.email : null);

  if (!email) {
    return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 });
  }

  if (isBootstrapAdmin(email)) {
    return NextResponse.json(
      { success: false, error: "Bootstrap admin cannot be deleted" },
      { status: 400 }
    );
  }

  const existing = await findManagedUserByEmail(email);
  if (!existing) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }

  await authDbClient.batch([
    {
      sql: 'DELETE FROM "session" WHERE userId = ?',
      args: [existing.id],
    },
    {
      sql: 'DELETE FROM "account" WHERE userId = ?',
      args: [existing.id],
    },
    {
      sql: 'DELETE FROM "user" WHERE id = ?',
      args: [existing.id],
    },
  ]);

  return NextResponse.json({
    success: true,
    data: { email },
  });
}
