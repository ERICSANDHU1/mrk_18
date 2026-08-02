import StudioExperience from "@/components/studio/StudioExperience";

export async function generateMetadata({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  return { title: `${decodeURIComponent(domain)} — your Studio · mrk18` };
}

export default async function StudioDomainPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  return <StudioExperience domain={decodeURIComponent(domain)} />;
}
