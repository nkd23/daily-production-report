import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ReportDateProvider } from "@/lib/report-date-context";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
});

export const metadata: Metadata = {
  title: "Báo Cáo Sản Lượng Hàng Ngày",
  description: "Hệ thống nhập & theo dõi sản lượng thay thế quy trình Zalo + Excel thủ công",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <AuthProvider>
          <ReportDateProvider>{children}</ReportDateProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
