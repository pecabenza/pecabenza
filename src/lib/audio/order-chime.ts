/**
 * Utilitário de alerta sonoro operacional para novos pedidos no SysFood.
 * Sintetizado via Web Audio API (D5 -> A5 sino suave) sem dependências externas ou risco de 404.
 */

const STORAGE_KEY_SOUND_ENABLED = 'pecabenza_admin_sound_enabled';
const STORAGE_KEY_SEEN_ORDERS = 'pecabenza_admin_seen_orders';

// Conjunto de IDs de pedidos já vistos para evitar repetição do sino no polling
let seenOrderIds: Set<string> = new Set();
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  if (!audioContext) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioContext = new AudioContextClass();
    }
  }

  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }

  return audioContext;
}

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(STORAGE_KEY_SOUND_ENABLED);
  return stored !== 'false'; // default é ativado
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_SOUND_ENABLED, enabled ? 'true' : 'false');
}

/**
 * Toca o sino operacional sintetizado (duas notas suaves em harmonia: D5 -> A5)
 */
export function playNewOrderChime(): void {
  if (!isSoundEnabled()) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Primeiro tom: Ré 5 (587.33 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.18, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.6);

    // Segundo tom harmônico: Lá 5 (880.00 Hz), com atraso de 140ms
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.14);

    gain2.gain.setValueAtTime(0, now + 0.14);
    gain2.gain.linearRampToValueAtTime(0.16, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(now + 0.14);
    osc2.stop(now + 0.85);
  } catch {
    // Falhas de autoplay ou permissão do navegador são silenciadas sem quebrar a UI
  }
}

/**
 * Verifica se há pedidos novos na lista recebida pelo polling.
 * Se houver pedidos ainda não registrados no conjunto de 'vistos', toca o sino
 * e registra os novos IDs.
 *
 * @param currentOrderIds Lista de IDs de pedidos atualmente na lista
 * @param isInitialLoad Se true, apenas popula os IDs iniciais sem tocar o sino
 */
export function checkAndNotifyNewOrders(currentOrderIds: string[], isInitialLoad = false): boolean {
  if (typeof window === 'undefined') return false;

  // Carrega IDs já vistos do cache de sessão se estiver vazio
  if (seenOrderIds.size === 0) {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY_SEEN_ORDERS);
      if (stored) {
        seenOrderIds = new Set(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }

  if (isInitialLoad) {
    currentOrderIds.forEach((id) => seenOrderIds.add(id));
    try {
      sessionStorage.setItem(STORAGE_KEY_SEEN_ORDERS, JSON.stringify(Array.from(seenOrderIds)));
    } catch {}
    return false;
  }

  let hasNew = false;
  for (const id of currentOrderIds) {
    if (!seenOrderIds.has(id)) {
      hasNew = true;
      seenOrderIds.add(id);
    }
  }

  if (hasNew) {
    try {
      sessionStorage.setItem(STORAGE_KEY_SEEN_ORDERS, JSON.stringify(Array.from(seenOrderIds)));
    } catch {}
    playNewOrderChime();
    return true;
  }

  return false;
}

