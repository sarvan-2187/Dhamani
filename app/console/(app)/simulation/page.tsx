import { getTranslations } from "next-intl/server";
import { SimulationPanel } from "@/components/console/forms";
import { Notice } from "@/components/ui/Notice";
import { requireCoordinator } from "@/lib/console/auth";
import { simulationEnabled } from "@/lib/console/simulation";

// PRD 10.5 / 14: only when SIMULATION_MODE=true.
export default async function SimulationPage() {
  await requireCoordinator();
  const t = await getTranslations("console.sim");
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-h1">{t("title")}</h1>
      {simulationEnabled() ? <SimulationPanel /> : <Notice variant="info" title={t("off")} />}
    </section>
  );
}
