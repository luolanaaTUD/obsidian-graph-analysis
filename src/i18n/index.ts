import { moment } from 'obsidian';
import type { UiLanguage } from '../types/types';
import en from './locales/en.json';
import zhHans from './locales/zh-Hans.json';

export type PluginLocale = 'en' | 'zh-Hans';

const LOCALES: Record<PluginLocale, Record<string, unknown>> = {
    en: en as Record<string, unknown>,
    'zh-Hans': zhHans as Record<string, unknown>,
};

let uiLanguageSetting: UiLanguage = 'auto';

/** Call after load/save settings so `t()` uses the plugin UI language preference. */
export function configureI18n(uiLanguage: UiLanguage): void {
    uiLanguageSetting = uiLanguage;
}

function isChineseLocaleTag(loc: string): boolean {
    return loc === 'zh-cn' || loc === 'zh-hans' || loc.startsWith('zh');
}

/** Obsidian / system locale (ignores plugin UI language override). */
export function getObsidianLocale(): PluginLocale {
    const momentLoc = moment.locale().toLowerCase();
    if (isChineseLocaleTag(momentLoc)) {
        return 'zh-Hans';
    }
    if (typeof navigator !== 'undefined') {
        const navLang = navigator.language?.toLowerCase() ?? '';
        if (isChineseLocaleTag(navLang)) {
            return 'zh-Hans';
        }
    }
    return 'en';
}

/** Plugin UI strings locale (settings override, else Obsidian). */
export function getPluginLocale(): PluginLocale {
    if (uiLanguageSetting === 'en') return 'en';
    if (uiLanguageSetting === 'zh-Hans') return 'zh-Hans';
    return getObsidianLocale();
}

/** Translate enum-like API values; falls back to raw value if no key exists. */
export function tEnum(keyPrefix: string, value: string): string {
    const key = `${keyPrefix}_${value}`;
    const translated = t(key);
    return translated === key ? value : translated;
}

function lookupString(locale: PluginLocale, key: string): string | undefined {
    let value: unknown = LOCALES[locale];
    for (const part of key.split('.')) {
        if (value == null || typeof value !== 'object') {
            return undefined;
        }
        value = (value as Record<string, unknown>)[part];
    }
    return typeof value === 'string' ? value : undefined;
}

export function t(key: string, params?: Record<string, string | number>): string {
    const locale = getPluginLocale();
    let s = lookupString(locale, key) ?? lookupString('en', key) ?? key;
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            s = s.replaceAll(`{{${k}}}`, String(v));
        }
    }
    return s;
}

/** Plural: picks one/other key based on count. */
export function tp(
    count: number,
    oneKey: string,
    otherKey: string,
    params?: Record<string, string | number>
): string {
    return t(count === 1 ? oneKey : otherKey, { ...params, count });
}
