import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fuhro Presenças",
  description: "Sistema de gestão de presença em reuniões",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
