'use strict';

var jsxRuntime = require('react/jsx-runtime');
var react = require('react');
var core = require('@tauri-apps/api/core');
var lucideReact = require('lucide-react');

/**
 * 設定タブプラグインを登録・管理するレジストリ
 */
class SettingsRegistry {
    constructor() {
        this.plugins = new Map();
    }
    static getInstance() {
        if (!SettingsRegistry.instance) {
            SettingsRegistry.instance = new SettingsRegistry();
        }
        return SettingsRegistry.instance;
    }
    /**
     * 設定タブプラグインを登録
     */
    register(plugin) {
        if (this.plugins.has(plugin.id)) {
            console.warn(`[SettingsRegistry] SettingTabPlugin with id "${plugin.id}" is already registered. Overwriting.`);
        }
        this.plugins.set(plugin.id, plugin);
    }
    /**
     * 設定タブプラグインの登録解除
     */
    unregister(id) {
        this.plugins.delete(id);
    }
    /**
     * 指定IDのプラグインを取得
     */
    get(id) {
        return this.plugins.get(id);
    }
    /**
     * 全プラグインを表示優先度順（order昇順）で取得
     */
    getAll() {
        return Array.from(this.plugins.values()).sort((a, b) => a.order - b.order);
    }
    /**
     * 全プラグインのデフォルト設定値をマージして取得
     */
    getAllDefaultValues() {
        const defaults = {};
        for (const plugin of this.plugins.values()) {
            Object.assign(defaults, plugin.defaultValues);
        }
        return defaults;
    }
}
const settingsRegistry = SettingsRegistry.getInstance();

const SETTINGS_STORAGE_KEY = 'restar-app-settings';
const SettingsContext = react.createContext(undefined);
const SettingsProvider = ({ children, initialTabId = 'appearance', onSettingChange, }) => {
    const [settings, setSettings] = react.useState(() => {
        const defaults = settingsRegistry.getAllDefaultValues();
        try {
            const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (saved) {
                return { ...defaults, ...JSON.parse(saved) };
            }
        }
        catch {
            // LocalStorage load error fallback
        }
        return defaults;
    });
    const [isSettingsOpen, setIsSettingsOpen] = react.useState(false);
    const [activeTabId, setActiveTabId] = react.useState(initialTabId);
    // Tauriネイティブ設定ファイルからのロード
    react.useEffect(() => {
        async function loadNativeSettings() {
            try {
                const nativeSettings = await core.invoke('plugin:restar-settings|load_settings');
                if (nativeSettings && Object.keys(nativeSettings).length > 0) {
                    setSettings((prev) => ({ ...prev, ...nativeSettings }));
                }
            }
            catch {
                // Tauri環境外や初回起動時は無視
            }
        }
        loadNativeSettings();
    }, []);
    // 設定値の更新
    const updateSetting = react.useCallback((key, value) => {
        setSettings((prev) => {
            const next = { ...prev, [key]: value };
            // LocalStorage 保存（フォールバック）
            try {
                localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
            }
            catch {
                // LocalStorage save error
            }
            // Tauri ネイティブ保存
            core.invoke('plugin:restar-settings|save_settings', { settings: next }).catch(() => {
                // Non-tauri environment or error
            });
            // 外部コールバック通知
            if (onSettingChange) {
                onSettingChange(key, value, next);
            }
            return next;
        });
    }, [onSettingChange]);
    // 設定値のリセット
    const resetSetting = react.useCallback((key) => {
        const defaults = settingsRegistry.getAllDefaultValues();
        if (key in defaults) {
            updateSetting(key, defaults[key]);
        }
    }, [updateSetting]);
    // モーダル開閉
    const openSettings = react.useCallback((tabId) => {
        if (tabId) {
            setActiveTabId(tabId);
        }
        setIsSettingsOpen(true);
    }, []);
    const closeSettings = react.useCallback(() => {
        setIsSettingsOpen(false);
    }, []);
    // Ctrl + , (Cmd + ,) ショートカットキーで設定を開く
    react.useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === ',') {
                e.preventDefault();
                setIsSettingsOpen((prev) => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
    return (jsxRuntime.jsx(SettingsContext.Provider, { value: {
            settings,
            updateSetting,
            resetSetting,
            isSettingsOpen,
            openSettings,
            closeSettings,
            activeTabId,
            setActiveTabId,
        }, children: children }));
};
const useSettings = () => {
    const context = react.useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};

const defaultIconMap = {
    Palette: jsxRuntime.jsx(lucideReact.Palette, { size: 16 }),
    FileText: jsxRuntime.jsx(lucideReact.FileText, { size: 16 }),
    BookOpen: jsxRuntime.jsx(lucideReact.BookOpen, { size: 16 }),
    Settings: jsxRuntime.jsx(lucideReact.Settings, { size: 16 }),
};
const SettingsModal = ({ title = '環境設定', customIcons = {}, }) => {
    const { isSettingsOpen, closeSettings, activeTabId, setActiveTabId, settings, updateSetting, resetSetting } = useSettings();
    const [searchQuery, setSearchQuery] = react.useState('');
    const icons = react.useMemo(() => ({ ...defaultIconMap, ...customIcons }), [customIcons]);
    // 登録済み全プラグインを取得
    const allTabs = react.useMemo(() => settingsRegistry.getAll(), []);
    // 検索クエリによるタブの絞り込み
    const filteredTabs = react.useMemo(() => {
        if (!searchQuery.trim())
            return allTabs;
        const q = searchQuery.toLowerCase();
        return allTabs.filter((tab) => {
            const matchTitle = tab.title.toLowerCase().includes(q);
            const matchKeywords = tab.keywords?.some((k) => k.toLowerCase().includes(q));
            return matchTitle || matchKeywords;
        });
    }, [allTabs, searchQuery]);
    // 現在アクティブなタブ
    const activeTab = react.useMemo(() => {
        return allTabs.find((t) => t.id === activeTabId) || allTabs[0];
    }, [allTabs, activeTabId]);
    if (!isSettingsOpen)
        return null;
    return (jsxRuntime.jsx("div", { className: "settings-modal-overlay", onClick: closeSettings, children: jsxRuntime.jsxs("div", { className: "settings-modal-container", onClick: (e) => e.stopPropagation(), children: [jsxRuntime.jsxs("div", { className: "settings-modal-header", children: [jsxRuntime.jsxs("div", { className: "settings-modal-title", children: [jsxRuntime.jsx(lucideReact.Settings, { size: 20, className: "settings-modal-icon" }), jsxRuntime.jsx("span", { children: title })] }), jsxRuntime.jsxs("div", { className: "settings-search-box", children: [jsxRuntime.jsx(lucideReact.Search, { size: 14, className: "settings-search-icon" }), jsxRuntime.jsx("input", { type: "text", className: "settings-search-input", placeholder: "\u8A2D\u5B9A\u3092\u691C\u7D22 (\u4F8B: \u30D5\u30A9\u30F3\u30C8, \u30C6\u30FC\u30DE, \u884C\u756A\u53F7)...", value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), autoFocus: true }), searchQuery && (jsxRuntime.jsx("button", { type: "button", className: "settings-search-clear", onClick: () => setSearchQuery(''), children: jsxRuntime.jsx(lucideReact.X, { size: 12 }) }))] }), jsxRuntime.jsx("button", { type: "button", className: "settings-modal-close-btn", onClick: closeSettings, title: "\u9589\u3058\u308B (Esc)", children: jsxRuntime.jsx(lucideReact.X, { size: 18 }) })] }), jsxRuntime.jsxs("div", { className: "settings-modal-body", children: [jsxRuntime.jsx("div", { className: "settings-sidebar", children: jsxRuntime.jsxs("div", { className: "settings-nav-list", children: [filteredTabs.map((tab) => (jsxRuntime.jsxs("button", { type: "button", className: `settings-nav-item ${activeTab?.id === tab.id ? 'active' : ''}`, onClick: () => setActiveTabId(tab.id), children: [jsxRuntime.jsx("span", { className: "settings-nav-icon", children: tab.icon && icons[tab.icon] ? icons[tab.icon] : jsxRuntime.jsx(lucideReact.Settings, { size: 16 }) }), jsxRuntime.jsx("span", { className: "settings-nav-title", children: tab.title })] }, tab.id))), filteredTabs.length === 0 && (jsxRuntime.jsx("div", { className: "settings-nav-empty", children: "\u8A72\u5F53\u3059\u308B\u8A2D\u5B9A\u306F\u3042\u308A\u307E\u305B\u3093" }))] }) }), jsxRuntime.jsx("div", { className: "settings-content-pane", children: activeTab ? (jsxRuntime.jsxs("div", { className: "settings-tab-panel", children: [jsxRuntime.jsx("div", { className: "settings-tab-header", children: jsxRuntime.jsx("h3", { className: "settings-tab-title", children: activeTab.title }) }), jsxRuntime.jsx("div", { className: "settings-tab-content", children: activeTab.render({
                                            settings,
                                            updateSetting,
                                            resetSetting,
                                            searchQuery,
                                        }) })] })) : (jsxRuntime.jsx("div", { className: "settings-empty-pane", children: "\u30AB\u30C6\u30B4\u30EA\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044" })) })] })] }) }));
};

exports.SettingsModal = SettingsModal;
exports.SettingsProvider = SettingsProvider;
exports.SettingsRegistry = SettingsRegistry;
exports.settingsRegistry = settingsRegistry;
exports.useSettings = useSettings;
//# sourceMappingURL=index.cjs.map
