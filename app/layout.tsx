import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import { LanluProvider } from "@/lib/store";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const prompt = Prompt({
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "LanLu · ร้านรู้",
  description: "ระบบวิเคราะห์ร้านสำหรับเจ้าของร้าน",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body className={prompt.className}><LanluProvider><AppShell>{children}</AppShell></LanluProvider></body></html>;
}
