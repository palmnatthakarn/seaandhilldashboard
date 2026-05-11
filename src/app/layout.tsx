import type { Metadata } from "next";
import "./globals.css";
import ConditionalLayout from "@/components/ConditionalLayout";
import { PermissionProvider } from "@/lib/permissions";
import { ComparisonProvider } from "@/lib/ComparisonContext";
import { QueryProvider } from "@/providers/QueryProvider";
import AuthProvider from "@/providers/AuthProvider";

export const metadata: Metadata = {
  title: "MIS Dashboard",
  description: "Management Information System Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Preload Sarabun Thai fonts used by PDF export — avoids first-click delay */}
        <link rel="preload" href="/fonts/Sarabun-Regular.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/Sarabun-Bold.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
      </head>
      <body
        className="antialiased bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
      >
        <AuthProvider>
          <QueryProvider>
            <PermissionProvider>
              <ComparisonProvider>
                <ConditionalLayout>
                  {children}
                </ConditionalLayout>
              </ComparisonProvider>
            </PermissionProvider>
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
