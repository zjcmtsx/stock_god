import * as vscode from 'vscode';

export interface ResolvedConfig {
  refreshInterval: number;
  statusBarRefreshInterval: number;
  statusBarMaxItems: number;
  list: { upColor: string; downColor: string };
  statusBar: { upColor: string; downColor: string };
}

const SECTION = 'mygod.stock';

export function readConfig(): ResolvedConfig {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  return {
    refreshInterval: clamp(cfg.get<number>('refreshInterval', 5), 1, 3600),
    statusBarRefreshInterval: clamp(cfg.get<number>('statusBarRefreshInterval', 3), 1, 3600),
    statusBarMaxItems: clamp(cfg.get<number>('statusBarMaxItems', 5), 1, 20),
    list: {
      upColor: cfg.get<string>('list.upColor', '#FF2E2E'),
      downColor: cfg.get<string>('list.downColor', '#00B578')
    },
    statusBar: {
      upColor: cfg.get<string>('statusBar.upColor', '#FF2E2E'),
      downColor: cfg.get<string>('statusBar.downColor', '#00B578')
    }
  };
}

function clamp(v: number | undefined, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return min;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

const HEX_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function resolveColor(value: string, fallbackThemeId: string): string | vscode.ThemeColor {
  if (!value || typeof value !== 'string') {
    return new vscode.ThemeColor(fallbackThemeId);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return new vscode.ThemeColor(fallbackThemeId);
  }
  if (HEX_PATTERN.test(trimmed)) return trimmed;
  if (/^[a-zA-Z]+$/.test(trimmed)) return trimmed;
  return new vscode.ThemeColor(fallbackThemeId);
}

export function affectsConfig(e: vscode.ConfigurationChangeEvent, key: string): boolean {
  return e.affectsConfiguration(`${SECTION}.${key}`);
}
