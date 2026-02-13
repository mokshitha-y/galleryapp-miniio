'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function HomePage() {
  const { ready, authenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (authenticated) router.replace('/gallery');
  }, [ready, authenticated, router]);

  if (!ready) {
    return <div className="app-loading">Loading…</div>;
  }
  if (authenticated) {
    return <div className="app-loading">Redirecting…</div>;
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Gallery</h1>
        <p>Sign in or create an account to manage your files.</p>
        <div className="auth-actions">
          <Link href="/login" className="btn btn-primary">
            Log in
          </Link>
          <Link href="/register" className="btn btn-outline">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
