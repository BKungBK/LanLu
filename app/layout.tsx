import type { Metadata } from "next";
import { LanluProvider } from "@/lib/store";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "LanLu · ร้านรู้",
  description: "ระบบวิเคราะห์ร้านสำหรับเจ้าของร้าน",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body><LanluProvider><AppShell>{children}</AppShell></LanluProvider></body></html>;
}
