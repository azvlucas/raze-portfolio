import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ModulePlaceholder({
  title,
  description,
  stage,
}: {
  title: string;
  description: string;
  stage: string;
}) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-10">
          <Badge variant="warning">Em breve · {stage}</Badge>
          <p className="max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
            Este módulo faz parte do MVP e será implementado na etapa{" "}
            <strong>{stage}</strong>. A modelagem de dados e as permissões já
            estão preparadas na fundação.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
