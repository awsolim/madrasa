import 'server-only';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isProgramId } from './public-links';

export async function resolvePublicProgramId(slug: string, reference: string) {
  // Legacy IDs (including staff previews) retain their existing authenticated flow.
  if (isProgramId(reference)) return reference;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/i.test(reference) || reference.length > 96) notFound();
  const { data, error } = await createSupabaseServerClient().rpc('resolve_public_program_link', {
    p_mosque_slug: slug, p_reference: reference,
  });
  if (error) throw new Error('The class link could not be loaded. Please try again.', { cause: error });
  const program = data?.[0];
  if (!program) notFound();
  return program.program_id;
}
