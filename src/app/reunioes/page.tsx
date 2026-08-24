import type { Metadata } from "next";

import { ComingSoonPage } from "@/components/coming-soon-page";

export const metadata: Metadata = {
  title: "Reuniões | Fuhro Presenças",
};

export default function MeetingsPage() {
  return (
    <ComingSoonPage
      currentPath="/reunioes"
      description="O cadastro e a gestão de reuniões serão implementados em uma próxima etapa."
      title="Reuniões"
    />
  );
}
