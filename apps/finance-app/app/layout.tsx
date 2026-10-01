import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Vendored, not next/font/google: that loader fetches from Google at build
// time, and Google intermittently answers with URLs it can't parse, failing
// the build (vercel/next.js#99114). File + license: app/fonts/.
const geistSans = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Finance App",
  description: "Stub app that shares the portal's Keycloak session to demonstrate SSO",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
