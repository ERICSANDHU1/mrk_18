import RunFlow from "@/components/app/cowork/RunFlow";

export const metadata = { title: "Run" };

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RunFlow runId={id} />;
}
