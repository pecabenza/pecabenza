export type TenantStatus = 'active' | 'suspended' | 'cancelled';
export type SiteMode = 'prelaunch' | 'live';
export type PageStatus = 'draft' | 'published';
export type ProductStatus = 'draft' | 'active' | 'archived';
export type UnitType = 'ml' | 'l' | 'g' | 'kg' | 'un' | 'cx' | 'portion' | 'other';
export type TenantRole = 'tenant_admin' | 'tenant_manager';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  site_mode: SiteMode;
  created_at: string;
  updated_at: string;
}

export interface TenantDomain {
  id: string;
  tenant_id: string;
  hostname: string;
  is_primary: boolean;
  is_verified: boolean;
  created_at: string;
}

export type SchemaBusinessType =
  | 'Organization'
  | 'LocalBusiness'
  | 'FoodEstablishment'
  | 'Restaurant'
  | 'Store'
  | string;

export interface TenantSettings {
  tenant_id: string;
  business_type?: SchemaBusinessType | null;
  serves_cuisine?: string | null;
  price_range?: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  instagram_handle: string | null;
  address_summary: string | null;
  prelaunch_banner_text: string;
  prelaunch_cta_text: string;
  business_hours: Record<string, string>;
  ga4_measurement_id?: string | null;
  gsc_verification_tag?: string | null;
  seo_defaults: {
    default_meta_title?: string;
    default_meta_description?: string;
    default_og_image?: string;
  };
  created_at: string;
  updated_at: string;
}

export interface TenantBranding {
  tenant_id: string;
  logo_url: string | null;
  favicon_url: string | null;
  font_family_heading: string;
  font_family_body: string;
  color_primary: string;
  color_secondary: string;
  color_accent: string;
  color_background: string;
  color_surface: string;
  color_text: string;
  border_radius: string;
  created_at: string;
  updated_at: string;
}

export type AssetSource = 'official' | 'mockup' | 'pending';

export interface MediaAsset {
  id: string;
  tenant_id: string;
  bucket: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  is_private: boolean;
  asset_source?: AssetSource;
  created_at: string;
}

export interface ProductCategory {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export interface ProductVariant {
  id: string;
  tenant_id: string;
  product_id: string;
  name: string;
  sku: string | null;
  unit_type: UnitType;
  unit_value: number;
  price_in_cents: number;
  is_available: boolean;
  display_order: number;
  created_at: string;
}

export interface ProductInformation {
  id: string;
  tenant_id: string;
  product_id: string;
  ingredients: string | null;
  allergens: string | null;
  temp_min?: number | null;
  temp_max?: number | null;
  temp_unit?: 'C' | 'F' | null;
  shelf_life?: string | null;
  after_thawing_instructions?: string | null;
  conservation_instructions: string | null;
  preparation_instructions: string | null;
  nutritional_info: Record<string, string>;
  created_at: string;
}

export interface Product {
  id: string;
  tenant_id: string;
  category_id: string | null;
  name: string;
  slug: string;
  short_description: string | null;
  full_description: string | null;
  cover_media_id: string | null;
  cover_image_url?: string | null;
  asset_source?: AssetSource;
  is_mockup?: boolean;
  status: ProductStatus;
  is_featured: boolean;
  primary_keyword?: string | null;
  secondary_keywords?: string[];
  search_intent?: 'commercial' | 'informational' | 'transactional' | 'navigational';
  created_at: string;
  updated_at: string;
  variants?: ProductVariant[];
  information?: ProductInformation | null;
  category?: ProductCategory | null;
}

export interface TenantPage {
  id: string;
  tenant_id: string;
  slug: string;
  title: string;
  meta_title: string | null;
  meta_description: string | null;
  og_media_id: string | null;
  primary_keyword?: string | null;
  secondary_keywords?: string[];
  search_intent?: 'commercial' | 'informational' | 'transactional' | 'navigational';
  canonical_url?: string | null;
  status: PageStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  sections?: TenantPageSection[];
}

export interface TenantPageSection {
  id: string;
  tenant_id: string;
  page_id: string;
  section_type: string;
  variant: string;
  display_order: number;
  is_active: boolean;
  content: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface UserConsent {
  id: string;
  tenant_id: string;
  consent_type: string;
  purpose: string;
  ip_hash: string;
  user_agent?: string | null;
  consent_given: boolean;
  created_at: string;
}

export interface PrivacyRequest {
  id: string;
  tenant_id: string;
  email: string;
  request_type: 'access' | 'deletion' | 'rectification';
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  notes?: string | null;
  created_at: string;
  resolved_at?: string | null;
}

export interface TenantFullContext {
  tenant: Tenant;
  domains: TenantDomain[];
  settings: TenantSettings;
  branding: TenantBranding;
}
