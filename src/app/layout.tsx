import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flintzy · Content planner",
  description: "Plan and manage your social media content in one place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
