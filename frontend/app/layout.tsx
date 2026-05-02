import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/context/AuthContext';
import { PageActionsProvider } from '@/context/PageActionsContext';
import LayoutShell from '@/components/LayoutShell';

export const metadata: Metadata = {
  title: 'PTM — Production & Dispatch Inventory',
  description: 'Pipe Manufacturing Inventory Management System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden">
        <AuthProvider>
          <PageActionsProvider>
            <LayoutShell>{children}</LayoutShell>
          </PageActionsProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              className: 'text-sm',
              success: { duration: 3000 },
              error: { duration: 5000 },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
