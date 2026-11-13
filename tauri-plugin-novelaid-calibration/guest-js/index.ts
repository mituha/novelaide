import { invoke } from '@tauri-apps/api/core';
import {
  CheckTextResult,
  ProjectDictionaryEntry,
  RubyCandidate,
  TokenInfo,
} from './models';

export * from './models';

export async function ping(value: string): Promise<string | null> {
  return await invoke<{ value?: string }>('plugin:novelaid-calibration|ping', {
    payload: {
      value,
    },
  }).then((r) => (r.value ? r.value : null));
}

export async function checkText(text: string): Promise<CheckTextResult> {
  return await invoke<CheckTextResult>('plugin:novelaid-calibration|check_text', {
    text,
  });
}

export async function tokenizeText(text: string): Promise<TokenInfo[]> {
  return await invoke<TokenInfo[]>('plugin:novelaid-calibration|tokenize_text', {
    text,
  });
}

export async function getRubyCandidates(text: string): Promise<RubyCandidate[]> {
  return await invoke<RubyCandidate[]>('plugin:novelaid-calibration|get_ruby_candidates', {
    text,
  });
}

export async function updateProjectDictionary(entries: ProjectDictionaryEntry[]): Promise<void> {
  return await invoke<void>('plugin:novelaid-calibration|update_project_dictionary', {
    entries,
  });
}
