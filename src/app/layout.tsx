import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Askbox",
  description: "Paid Q&A for Fanvue creators. Fans pay to ask, you answer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* @fanvue/ui's typography utilities ask for the family "Inter" by name,
            so next/font's hashed family name would miss. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
