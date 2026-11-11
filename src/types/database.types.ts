export type TenantStatus = 'active' | 'suspended' | 'cancelled';
export type SiteMode = 'prelaunch' | 'institutional' | 'commerce';
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
  commerceSettings?: TenantCommerceSettings;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'awaiting_payment'
  | 'paid';

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'refunded'
  | 'unpaid'
  | 'awaiting_payment';

export type FulfillmentType = 'delivery' | 'pickup' | 'dine_in';
export type ScheduleType = 'asap' | 'scheduled';
export type OrderChannel = 'website' | 'whatsapp' | 'phone' | 'counter' | 'admin';
export type OrderPaymentMethod = 'pix' | 'cash' | 'card_on_delivery' | 'pos_card' | 'credit_card';

export interface TenantCommerceSettings {
  tenant_id: string;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  fixed_delivery_fee_cents: number;
  free_delivery_threshold_cents?: number | null;
  min_order_value_cents: number;
  asap_enabled: boolean;
  scheduled_enabled: boolean;
  estimated_delivery_time_min: number;
  estimated_pickup_time_min: number;
  target_confirmation_time_min?: number;
  target_preparation_time_min?: number;
  sla_warning_buffer_min?: number;
  schedule_preparation_buffer_min?: number;
  created_at: string;
  updated_at: string;
}

export type ItemPreparationStatus = 'pending' | 'preparing' | 'ready';

export interface OrderItemOperation {
  id: string;
  tenant_id: string;
  order_id: string;
  order_item_id: string;
  preparation_status: ItemPreparationStatus;
  started_at?: string | null;
  completed_at?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type OrderOperationEventType =
  | 'item_started'
  | 'item_ready'
  | 'order_started'
  | 'order_ready'
  | 'priority_changed'
  | 'sla_warning'
  | 'sla_breached'
  | 'station_step_started'
  | 'station_step_completed'
  | 'station_step_skipped'
  | 'station_capacity_warning'
  | 'predicted_delay';

export type ProductionStationType =
  | 'kitchen'
  | 'grill'
  | 'oven'
  | 'assembly'
  | 'drinks'
  | 'dessert'
  | 'expedition'
  | 'custom';

export interface ProductionStation {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description?: string | null;
  display_order: number;
  station_type: ProductionStationType;
  is_active: boolean;
  default_capacity: number;
  default_duration_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface ProductProductionStep {
  id: string;
  tenant_id: string;
  product_id: string;
  variant_id?: string | null;
  station_id: string;
  step_order: number;
  estimated_duration_seconds: number;
  capacity_weight: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type OrderItemProductionStepStatus =
  | 'blocked'
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'skipped'
  | 'cancelled';

export interface OrderItemProductionStep {
  id: string;
  tenant_id: string;
  order_id: string;
  order_item_id: string;
  station_id?: string | null;
  snapshot_station_name: string;
  snapshot_station_slug: string;
  snapshot_station_type: ProductionStationType;
  step_order: number;
  status: OrderItemProductionStepStatus;
  estimated_duration_seconds: number;
  capacity_weight: number;
  started_at?: string | null;
  completed_at?: string | null;
  assigned_user_id?: string | null;
  override_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderOperationEvent {
  id: string;
  tenant_id: string;
  order_id: string;
  order_item_id?: string | null;
  event_type: OrderOperationEventType;
  actor_user_id?: string | null;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface Order {
  id: string;
  tenant_id: string;
  order_number: string;
  public_tracking_token?: string;
  order_channel?: OrderChannel;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  fulfillment_type: FulfillmentType;
  schedule_type: ScheduleType;
  scheduled_for?: string | null;
  status: OrderStatus;
  payment_method?: OrderPaymentMethod;
  payment_status: PaymentStatus;
  cash_change_for_cents?: number | null;
  subtotal_cents: number;
  delivery_fee_cents: number;
  discount_cents: number;
  total_cents: number;
  currency: string;
  notes?: string | null;
  created_by_user_id?: string | null;
  idempotency_key?: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
  address?: OrderAddress | null;
}

export interface OrderStatusEvent {
  id: string;
  tenant_id: string;
  order_id: string;
  from_status?: OrderStatus | null;
  to_status: OrderStatus;
  source: 'system' | 'admin' | 'payment_webhook' | 'delivery_provider' | 'driver';
  actor_user_id?: string | null;
  metadata?: Record<string, any>;
  created_at: string;
}


export interface OrderItem {
  id: string;
  tenant_id: string;
  order_id: string;
  product_id: string;
  variant_id: string;
  snapshot_product_name: string;
  snapshot_variant_name: string;
  quantity: number;
  unit_price_cents: number;
  subtotal_cents: number;
  created_at: string;
}

export interface OrderAddress {
  id: string;
  tenant_id: string;
  order_id: string;
  zip_code: string;
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  reference?: string | null;
  created_at: string;
}

export type PaymentGatewayProvider = 'mock' | 'asaas' | 'mercadopago';
export type PaymentMethod = 'pix' | 'credit_card' | 'cash' | 'card_on_delivery' | 'pos_card';
export type PaymentTransactionStatus = 'pending' | 'paid' | 'expired' | 'failed' | 'refunded';

export interface TenantPaymentSettings {
  tenant_id: string;
  provider: PaymentGatewayProvider;
  is_active: boolean;
  pix_enabled: boolean;
  pix_expiration_minutes: number;
  sandbox_mode: boolean;
  api_key_encrypted?: string | null;
  webhook_secret?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentTransaction {
  id: string;
  tenant_id: string;
  order_id: string;
  provider: PaymentGatewayProvider;
  provider_payment_id?: string | null;
  method: PaymentMethod;
  status: PaymentTransactionStatus;
  amount_cents: number;
  pix_qr_code_text?: string | null;
  pix_qr_code_url?: string | null;
  pix_expires_at: string;
  paid_at?: string | null;
  failed_reason?: string | null;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface PaymentWebhookEventRecord {
  id: string;
  tenant_id: string;
  provider: PaymentGatewayProvider;
  event_id: string;
  event_type: string;
  payload: Record<string, any>;
  processed: boolean;
  processed_at?: string | null;
  error_message?: string | null;
  created_at: string;
}

// ==============================================================================
// Etapa 3E — Gestão de Entregas, Expedição, Motoboys e Rastreamento
// ==============================================================================

export type DriverType = 'internal' | 'freelance' | 'third_party';
export type DriverVehicleType = 'motorcycle' | 'car' | 'bicycle' | 'other';
export type DriverAvailabilityStatus = 'available' | 'on_route' | 'offline';

export type DeliveryRunStatus = 'draft' | 'dispatched' | 'in_progress' | 'completed' | 'cancelled';
export type DeliveryRouteStrategy = 'manual' | 'neighborhood_group' | 'google_route_optimization';

export type DeliveryStatus =
  | 'pending_dispatch'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'arrived'
  | 'delivered'
  | 'failed_attempt'
  | 'returned_to_store'
  | 'cancelled';

export type ProofRelationship = 'recipient' | 'concierge' | 'family' | 'neighbor' | 'other';

export interface DeliveryDriver {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  driver_type: DriverType;
  vehicle_type: DriverVehicleType;
  vehicle_plate?: string | null;
  availability_status: DriverAvailabilityStatus;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryRun {
  id: string;
  tenant_id: string;
  run_code: string;
  driver_id?: string | null;
  status: DeliveryRunStatus;
  driver_token_hash?: string | null;
  driver_token_expires_at?: string | null;
  location_sharing_enabled: boolean;
  location_consent_at?: string | null;
  location_ended_at?: string | null;
  route_strategy: DeliveryRouteStrategy;
  route_metadata: Record<string, any>;
  notes?: string | null;
  dispatched_at?: string | null;
  completed_at?: string | null;
  created_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderDelivery {
  id: string;
  tenant_id: string;
  order_id: string;
  run_id?: string | null;
  driver_id?: string | null;
  stop_sequence: number;
  delivery_status: DeliveryStatus;
  attempt_count: number;
  payment_to_collect_cents: number;
  payment_collected_confirmed: boolean;
  proof_recipient_name?: string | null;
  proof_relationship?: ProofRelationship | null;
  proof_photo_path?: string | null;
  proof_notes?: string | null;
  failure_reason?: string | null;
  sanitary_quarantine_required: boolean;
  assigned_at?: string | null;
  dispatched_at?: string | null;
  arrived_at?: string | null;
  delivered_at?: string | null;
  failed_at?: string | null;
  returned_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryEvent {
  id: string;
  tenant_id: string;
  delivery_id: string;
  run_id?: string | null;
  order_id: string;
  event_type: string;
  from_status?: string | null;
  to_status?: string | null;
  source: 'admin' | 'driver' | 'system' | 'delivery_provider';
  actor_user_id?: string | null;
  driver_id?: string | null;
  notes?: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface DeliveryLocationPing {
  id: string;
  tenant_id: string;
  run_id: string;
  driver_id?: string | null;
  latitude: number;
  longitude: number;
  accuracy_meters?: number | null;
  recorded_at: string;
  expires_at: string;
}


