import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import "./globals.css";
export const metadata: Metadata = {
  title: "Drishyana AI — Stories in Motion",
  description: "Turn every story into a cinematic video in your language.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <PageTitle />
        {children}
      </body>
    </html>
  );
}
