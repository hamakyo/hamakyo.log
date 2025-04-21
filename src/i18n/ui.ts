/**
 * This configures the translations for all ui text in your website. 
 * 
 * All languages will follow this ordering/structure and will fallback to the
 * default language for any entries that haven't been translated 
 */
import type { SupportedLanguage } from "src/utils/i18n";

export default {
    "ja": {
        "site.title": {
            text: "浜京のブログ"
        },
        "site.description": {
            text: "Astroで構築されたミニマリストブログテーマ。ブログを始めたい人のための、迅速で簡単なスターターテーマです。"
        },
        "profile.description": {
            text: "自己紹介文をここに入力します"
        },
        "blog.lastUpdated": {
            text: "最終更新日:"
        },
        "sidebar.tableOfContents": {
            text: "目次"
        },
        "project.platform": {
            text: "プラットフォーム"
        },
        "project.stack": {
            text: "技術スタック"
        },
        "project.website": {
            text: "ウェブサイト"
        }
    }
} as const satisfies TranslationUIEntries;

type TranslationUIEntries = Record<SupportedLanguage, Record<string, UIEntry>>;

export type UIEntry = { text: string };