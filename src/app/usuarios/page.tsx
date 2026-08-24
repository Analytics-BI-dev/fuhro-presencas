import type { Metadata } from "next";

import { ComingSoonPage } from "@/components/coming-soon-page";

export const metadata: Metadata = {
  title: "Usuários | Fuhro Presenças",
};

export default function UsersPage() {
  return (
    <ComingSoonPage
      currentPath="/usuarios"
      description="A criação e a gestão de usuários permanecem fora do escopo desta etapa."
      title="Usuários"
    />
  );
}
