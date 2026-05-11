import { NextResponse } from "next/server";
import { getCurrentSessionUser, isAdminUser } from "@/lib/auth-policy";

export async function GET() {
  const user = await getCurrentSessionUser();

  return NextResponse.json({
    success: true,
    data: {
      isAdmin: isAdminUser(user),
    },
  });
}
