'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function GalleryLayout({ children }) {
  const { ready, authenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) router.replace('/login');
  }, [ready, authenticated, router]);

  if (!ready || !authenticated) {
    return <div className="app-loading">Loading…</div>;
  }
  return children;
}
