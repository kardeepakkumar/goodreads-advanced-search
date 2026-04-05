import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Goodreads Advanced Search',
  description: 'Genre-first book discovery powered by Goodreads data',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
