export const isProgramId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function publicProgramHref(slug: string, program: { id: string; public_slug?: string | null; publication_status?: string; is_active?: boolean }) {
  const publicLink = program.is_active !== false && (!program.publication_status || ['published', 'hidden'].includes(program.publication_status));
  const reference = publicLink && program.public_slug ? program.public_slug : program.id;
  return `/m/${encodeURIComponent(slug)}/programs/${encodeURIComponent(reference)}`;
}
