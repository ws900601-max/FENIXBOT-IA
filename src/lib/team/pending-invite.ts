// Guarda o convite aberto antes do login para levar a pessoa de volta a ele depois.
const KEY = "fenixbot:convite";

export function savePendingInvite(token: string) {
  try { localStorage.setItem(KEY, token); } catch { /* armazenamento indisponível: a pessoa reabre o link */ }
}

export function takePendingInvite() {
  try {
    const token = localStorage.getItem(KEY);
    if (token) localStorage.removeItem(KEY);
    return token;
  } catch {
    return null;
  }
}
