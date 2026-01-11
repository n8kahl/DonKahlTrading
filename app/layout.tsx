import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { AIProvider } from "@/components/ai-provider"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://tucson-trader.up.railway.app"),
  title: "Tucson Trader | Market Analysis Dashboard",
  description: "Professional market extremes and heatmap analysis for trading",
  icons: {
    icon: [
      {
        url: "/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: "/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Tucson Trader",
    description: "Professional market extremes and heatmap analysis for trading",
    url: "https://tucsontrader.com",
    siteName: "Tucson Trader",
    images: [
      {
        url: "/og-image.png",
        width: 630,
        height: 630,
        alt: "Tucson Trader - Market Analysis Dashboard",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tucson Trader",
    description: "Professional market extremes and heatmap analysis for trading",
    images: ["/og-image.png"],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AIProvider>
            {children}
          </AIProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
