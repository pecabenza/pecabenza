import crypto from 'crypto';

export const CURRENT_ENCRYPTION_VERSION = 'v1';

/**
 * Obtém a chave mestre de criptografia (32 bytes para AES-256-GCM).
 * Em produção, utiliza PAYMENT_ENCRYPTION_KEY do Secret Manager / Vault.
 * Em desenvolvimento/testes, deriva deterministicamente via SHA-256 do SUPABASE_SERVICE_ROLE_KEY.
 */
function getMasterKey(version: string = CURRENT_ENCRYPTION_VERSION): Buffer {
  if (version === 'v1') {
    const customKey = process.env.PAYMENT_ENCRYPTION_KEY;
    if (customKey && customKey.length >= 32) {
      return Buffer.from(customKey.slice(0, 32), 'utf-8');
    }

    const fallbackSeed =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      'fallback-local-dev-seed-key-32-bytes-sysfood';

    return crypto.createHash('sha256').update(fallbackSeed).digest();
  }

  throw new Error(`Versão de chave/algoritmo de criptografia não suportada: ${version}`);
}

/**
 * Criptografa um segredo usando AES-256-GCM com IV aleatório e Auth Tag
 * Formato retornado com versão: "v1:iv_hex:auth_tag_hex:encrypted_hex"
 */
export function encryptSecret(plainText: string, version: string = CURRENT_ENCRYPTION_VERSION): string {
  if (!plainText) return '';
  const key = getMasterKey(version);
  const iv = crypto.randomBytes(12); // 96 bits recomendado para GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  return `${version}:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decifra um segredo em formato versionado "v1:iv_hex:auth_tag_hex:encrypted_hex"
 * Mantém retrocompatibilidade com formato anterior sem versão "iv_hex:auth_tag_hex:encrypted_hex"
 */
export function decryptSecret(cipherText: string): string {
  if (!cipherText) return '';

  const parts = cipherText.split(':');

  let version = CURRENT_ENCRYPTION_VERSION;
  let ivHex = '';
  let authTagHex = '';
  let encryptedHex = '';

  if (parts.length === 4) {
    // Formato versionado: "v1:iv:tag:cipher"
    [version, ivHex, authTagHex, encryptedHex] = parts;
  } else if (parts.length === 3) {
    // Formato legado sem versão: "iv:tag:cipher"
    [ivHex, authTagHex, encryptedHex] = parts;
    version = 'v1';
  } else {
    // Texto puro sem formatação criptográfica
    return cipherText;
  }

  try {
    const key = getMasterKey(version);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    throw new Error('Falha de integridade criptográfica ao decifrar segredo de pagamento.');
  }
}

/**
 * Extrai a versão da chave/algoritmo utilizada no ciphertext
 */
export function getEncryptionVersion(cipherText: string): string | null {
  if (!cipherText) return null;
  const parts = cipherText.split(':');
  if (parts.length === 4) return parts[0];
  if (parts.length === 3) return 'v1-legacy';
  return 'unencrypted';
}

/**
 * Mascara segredos para visualização administrativa segura (ex: "****3a1b")
 */
export function maskSecret(secret?: string | null): string {
  if (!secret) return '';
  if (secret.length <= 4) return '****';
  return `****${secret.slice(-4)}`;
}

/**
 * Comparação em tempo constante (Timing-Safe) contra ataques de canal lateral (Timing Attacks)
 */
export function timingSafeStringEqual(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}
