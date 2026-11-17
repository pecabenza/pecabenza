import { createAdminClient } from '@/lib/supabase/admin';

export interface CmsPageSectionRow {
  id: string;
  section_type: string;
  variant: string;
  display_order: number;
  is_active: boolean;
  content: Record<string, any>;
}

/**
 * Busca seções CMS publicadas de uma página do tenant (ex: 'sobre', 'contato').
 * Retorna array vazio caso a página ainda não tenha sido customizada no admin.
 */
export async function getTenantPageSections(
  tenantId: string,
  pageSlug: string
): Promise<CmsPageSectionRow[]> {
  try {
    const supabase = createAdminClient();
    const { data: page } = await supabase
      .from('tenant_pages')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('slug', pageSlug)
      .maybeSingle();

    if (!page?.id) return [];

    const { data: sections } = await supabase
      .from('tenant_page_sections')
      .select('id, section_type, variant, display_order, is_active, content')
      .eq('tenant_id', tenantId)
      .eq('page_id', page.id)
      .order('display_order', { ascending: true });

    return (sections as CmsPageSectionRow[]) || [];
  } catch {
    return [];
  }
}

