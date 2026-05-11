'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth-client';

export function UnauthorizedActions() {
  const router = useRouter();

  const handleBackToLogin = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          router.replace('/login');
        },
      },
    });
  };

  return (
    <button
      type="button"
      onClick={handleBackToLogin}
      className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[hsl(var(--primary))] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:scale-[1.02] hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98] sm:mt-9 sm:w-auto"
    >
      <ArrowLeft className="h-4 w-4" />
      Go Back
    </button>
  );
}
