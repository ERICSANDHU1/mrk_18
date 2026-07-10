import TasterExplore from "@/components/taster/TasterExplore";

export async function generateMetadata({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  return { title: `${decodeURIComponent(domain)} — free CMO verdict · mrk18` };
}

export default async function TasterPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  return <TasterExplore domain={decodeURIComponent(domain)} />;
}
