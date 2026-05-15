import { PresetPreviewClient } from './preset-preview-client';

export default async function PresetPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PresetPreviewClient slug={slug} />;
}
