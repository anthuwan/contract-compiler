import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Contract Compiler — Documents to trusted payments",
  description:
    "Reconcile contracts and purchase orders, then turn approved terms into a guarded PayPal Sandbox workflow.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
