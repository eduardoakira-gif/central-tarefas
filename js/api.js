/*
 * api.js
 * Conversa com a função "api" do Supabase.
 */
import { API_URL } from './config.js';

export class ApiError extends Error {
  constructor(message, status, code = '') {
    super(message);
    this.status = status; // 0 = sem conexão
    this.code = code; // ex.: pin_required, pin_invalid, not_found, ai_not_configured
  }
}

export const apiConfigured = () => /^https:\/\//.test(API_URL) && !API_URL.includes('SEU-PROJETO');

export async function api(action, payload = {}, { timeout = 20000 } = {}) {
  if (!apiConfigured()) {
    throw new ApiError('O endereço do servidor ainda não foi configurado no arquivo js/config.js.', -1);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({ action }, payload)),
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError('Sem conexão com o servidor.', 0);
  } finally {
    clearTimeout(timer);
  }
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) throw new ApiError(data.error || `O servidor respondeu ${res.status}.`, res.status, data.code || '');
  return data;
}
