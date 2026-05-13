'use client';

import {
  BarChart3,
  Building2,
  ChartNoAxesCombined,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { signIn } from "@/lib/auth-client";

const highlights = [
  { label: "ยอดขาย Real-time", icon: ChartNoAxesCombined },
  { label: "เปรียบเทียบกิจการ", icon: Building2 },
  { label: "AI วิเคราะห์", icon: Sparkles },
];

const stats = [
  { label: "Real-time", value: "ยอดขาย" },
  { label: "เปรียบเทียบ", value: "กิจการ" },
  { label: "วิเคราะห์", value: "AI" },
];

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,hsl(var(--primary)/0.18),transparent_32%),radial-gradient(circle_at_82%_82%,hsl(var(--chart-2)/0.14),transparent_34%)]" />

      <section className="relative hidden w-[56%] flex-col justify-between px-16 py-12 lg:flex xl:px-20">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--primary))] text-white shadow-lg shadow-indigo-500/20">
            <BarChart3 className="h-5 w-5" />
          </div>
          <span className="text-sm font-semibold tracking-wide">MIS Dashboard</span>
        </div>

        <div className="max-w-xl space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--primary))]/25 bg-[hsl(var(--primary))]/10 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" />
            <span className="text-xs font-medium text-[hsl(var(--primary))]">
              ระบบจัดการข้อมูลธุรกิจ
            </span>
          </div>

          <div className="space-y-5">
            <h1 className="max-w-[620px] text-5xl font-bold leading-[1.12] text-[hsl(var(--foreground))]">
              ข้อมูลธุรกิจ
              <br />
              <span className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--chart-2))] bg-clip-text text-transparent">
                ในมือผู้บริหาร
              </span>
            </h1>
            <p className="max-w-lg text-base leading-7 text-[hsl(var(--muted-foreground))]">
             รวมข้อมูลยอดขาย บัญชี สินค้าคงคลัง และรายงานธุรกิจแบบ Real-time 
             ครบในที่เดียว
            </p>
          </div>

          <div className="grid max-w-lg grid-cols-3 gap-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/70 p-4 shadow-sm backdrop-blur"
              >
                <p className="text-lg font-bold text-[hsl(var(--primary))]">{stat.value}</p>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          © 2026 Sea & Hill · ข้อมูลทั้งหมดเป็นความลับ
        </p>
      </section>

      <section className="relative flex w-full items-start justify-center px-5 py-8 sm:px-8 sm:py-12 md:items-center lg:w-[44%]">
        <div className="w-full max-w-[430px] space-y-6 lg:max-w-[380px]">
          <div className="space-y-5 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--primary))] text-white">
                <BarChart3 className="h-5 w-5" />
              </div>
              <span className="text-base font-bold">MIS Dashboard</span>
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--primary))]/25 bg-[hsl(var(--primary))]/10 px-3 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" />
                <span className="text-xs font-medium text-[hsl(var(--primary))]">
                  ระบบจัดการข้อมูลธุรกิจ
                </span>
              </div>
              <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
                ข้อมูลธุรกิจในมือผู้บริหาร
              </h1>
              <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                เข้าสู่ระบบเพื่อดูภาพรวมและรายงานของ Sea & Hill
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {highlights.map((item) => (
                <span
                  key={item.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1.5 text-xs font-medium"
                >
                  <item.icon className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 p-6 shadow-2xl shadow-slate-950/10 backdrop-blur sm:p-8">
            <div className="mb-7 space-y-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--chart-2))] text-white shadow-lg shadow-indigo-500/25">
                <LockKeyhole className="h-6 w-6" />
              </div>
              <h2 className="pt-2 text-xl font-bold">ยินดีต้อนรับ</h2>
              <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                เข้าสู่ระบบด้วยบัญชี Google ที่ได้รับอนุญาต
              </p>
            </div>

            <div className="mb-5 h-px bg-[hsl(var(--border))]" />

            <button
              type="button"
              onClick={() =>
                signIn.social({
                  provider: "google",
                  callbackURL: "/",
                  errorCallbackURL: "/unauthorized",
                })
              }
              className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm font-semibold shadow-sm transition hover:border-[hsl(var(--primary))]/60 hover:bg-[hsl(var(--primary))]/5 hover:shadow-md active:scale-[0.99]"
            >
              <span className="absolute inset-y-0 left-0 w-1 bg-[hsl(var(--primary))] opacity-0 transition-opacity group-hover:opacity-100" />
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continue with Google
            </button>

            <div className="mt-6 flex items-start gap-2 rounded-lg bg-[hsl(var(--muted))]/70 px-3 py-2.5 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary))]" />
              เฉพาะบัญชีที่ได้รับอนุญาตจากผู้ดูแลระบบเท่านั้น
            </div>
          </div>

          <p className="text-center text-[11px] text-[hsl(var(--muted-foreground))] lg:hidden">
            2026 Sea & Hill · ข้อมูลทั้งหมดเป็นความลับ
          </p>
        </div>
      </section>
    </main>
  );
}
