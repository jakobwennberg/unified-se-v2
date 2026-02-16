import type { Metadata } from 'next';
import { Outfit, DM_Serif_Text } from 'next/font/google';
import { SupabaseProvider } from '@/components/providers/supabase-provider';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const dmSerif = DM_Serif_Text({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Unified Accounting API',
  description: 'Unified API for Swedish accounting systems',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body suppressHydrationWarning className={`${outfit.variable} ${dmSerif.variable} font-sans`}>
        <SupabaseProvider>
          {children}
        </SupabaseProvider>
      </body>
    </html>
  );
}
