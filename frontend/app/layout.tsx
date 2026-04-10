import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'PTM — Production & Dispatch Inventory',
  description: 'Pipe Manufacturing Inventory Management System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {children}
        </main>
        <Toaster
          position="top-right"
          toastOptions={{
            className: 'text-sm',
            success: { duration: 3000 },
            error: { duration: 5000 },
          }}
        />
      </body>
    </html>
  );
}
