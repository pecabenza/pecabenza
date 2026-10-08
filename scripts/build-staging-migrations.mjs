import fs from 'fs';
import path from 'path';

const migrationsDir = path.resolve('e:/projetos/sysfood/supabase/migrations');
const outputFile = path.resolve('e:/projetos/sysfood/supabase/staging_bundle.sql');

const files = [
  '00001_multi_tenant_foundation.sql',
  '00002_catalog_and_media.sql',
  '00003_cms_and_sections.sql',
  '00004_seed_benza.sql',
  '00005_homologation_tenant_02.sql',
  '00006_storage_tenant_assets.sql',
  '00007_privacy_lgpd_and_seo.sql',
];

let bundleContent = `-- ==============================================================================
-- BUNDLE DE MIGRATIONS DE STAGING - SAAS SYSFOOD (MIGRATIONS 00001 A 00006)
-- Gerado automaticamente para execução no Supabase SQL Editor
-- ==============================================================================

`;

for (const file of files) {
  const filePath = path.join(migrationsDir, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    bundleContent += `\n-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n`;
    bundleContent += `-- INÍCIO: ${file}\n`;
    bundleContent += `-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n\n`;
    bundleContent += content;
    bundleContent += `\n\n-- FIM: ${file}\n\n`;
  } else {
    console.error(`Arquivo não encontrado: ${filePath}`);
    process.exit(1);
  }
}

fs.writeFileSync(outputFile, bundleContent, 'utf8');
console.log(`Bundle de staging gerado com sucesso em: ${outputFile} (${bundleContent.length} bytes)`);
