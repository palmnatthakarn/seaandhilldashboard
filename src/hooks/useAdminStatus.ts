'use client';

import { useEffect, useState } from 'react';

let cachedIsAdmin: boolean | null = null;
let pendingAdminRequest: Promise<boolean> | null = null;

async function fetchAdminStatus() {
  if (cachedIsAdmin !== null) {
    return cachedIsAdmin;
  }

  pendingAdminRequest ??= fetch('/api/admin/me')
    .then((response) => (response.ok ? response.json() : null))
    .then((json) => Boolean(json?.data?.isAdmin))
    .catch(() => false)
    .then((isAdmin) => {
      cachedIsAdmin = isAdmin;
      pendingAdminRequest = null;
      return isAdmin;
    });

  return pendingAdminRequest;
}

export function useAdminStatus() {
  const [isAdmin, setIsAdmin] = useState(cachedIsAdmin ?? false);

  useEffect(() => {
    let active = true;

    fetchAdminStatus().then((nextIsAdmin) => {
      if (active) {
        setIsAdmin(nextIsAdmin);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return isAdmin;
}
