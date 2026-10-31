pub mod context;
pub mod prohibited_char;
pub mod closing_period;
pub mod three_dots_leader;
pub mod dash_leader;
pub mod bracket_trailing_space;
pub mod exclamation_space;
pub mod exclamation_normalization;
pub mod indent_first_line;
pub mod dropping_ra;
pub mod double_negative;
pub mod doubled_joshi;
pub mod kanji_open_close;

use std::collections::HashMap;
use crate::models::CalibrationIssue;
use self::context::CalibrationContext;
pub use self::prohibited_char::ProhibitedCharRule;
pub use self::closing_period::ClosingPeriodRule;
pub use self::three_dots_leader::ThreeDotsLeaderRule;
pub use self::dash_leader::DashLeaderRule;
pub use self::bracket_trailing_space::BracketTrailingSpaceRule;
pub use self::exclamation_space::ExclamationSpaceRule;
pub use self::exclamation_normalization::ExclamationNormalizationRule;
pub use self::indent_first_line::IndentFirstLineRule;
pub use self::dropping_ra::DroppingRaRule;
pub use self::double_negative::DoubleNegativeRule;
pub use self::doubled_joshi::DoubledJoshiRule;
pub use self::kanji_open_close::KanjiOpenCloseRule;

/// すべての校正ルールが実装すべき共通 Trait（インターフェース）
pub trait CalibrationRule: Send + Sync {
    /// ルールの一意な識別子（例: "novel-no-half-width-space"）
    fn id(&self) -> &'static str;

    /// ルール名（設定UI等に表示される名称）
    fn name(&self) -> &'static str;

    /// カテゴリ（"novel_style", "grammar", "kanji_open_close" など）
    fn rule_type(&self) -> &'static str;

    /// デフォルトで有効かどうか
    fn default_enabled(&self) -> bool {
        true
    }

    /// 文書コンテキストを受け取り、該当する指摘リストを返却
    fn check(&self, ctx: &CalibrationContext) -> Vec<CalibrationIssue>;
}

/// 校正ルールの登録・管理および一括実行マネージャー
pub struct RuleRegistry {
    rules: Vec<Box<dyn CalibrationRule>>,
}

impl Default for RuleRegistry {
    fn default() -> Self {
        Self::new_with_defaults()
    }
}

impl RuleRegistry {
    pub fn new() -> Self {
        Self { rules: Vec::new() }
    }

    /// ルールを追加登録
    pub fn register<R: CalibrationRule + 'static>(&mut self, rule: R) {
        self.rules.push(Box::new(rule));
    }

    /// デフォルトの小説校正ルール一式を登録したインスタンスを作成
    pub fn new_with_defaults() -> Self {
        let mut registry = Self::new();

        // 1. 半角空白禁止ルール（ProhibitedCharRule のコンストラクタ指定）
        registry.register(ProhibitedCharRule::new(
            "novel-no-half-width-space",
            "半角空白の禁止",
            ' ',
            Some("　".into()),
            "小説執筆では原則として半角空白は使用しません。全角空白への置換を推奨します",
        ));

        // 2. 全角パイプ禁止ルール（ProhibitedCharRule のコンストラクタ指定）
        registry.register(ProhibitedCharRule::new(
            "novel-no-full-width-pipe",
            "全角パイプの禁止",
            '｜',
            Some("|".into()),
            "ルビ開始記号には半角パイプ「|」を使用します。全角「｜」は使用しません",
        ));

        // 3. 会話文末の句点チェック
        registry.register(ClosingPeriodRule::default());

        // 4. 三点リーダー（2マス）チェック
        registry.register(ThreeDotsLeaderRule::default());

        // 5. ダッシュ（2マス）チェック
        registry.register(DashLeaderRule::default());

        // 6. 括弧直前の不要な空白除去チェック
        registry.register(BracketTrailingSpaceRule::default());

        // 7. 感嘆符・疑問符後の全角空白チェック
        registry.register(ExclamationSpaceRule::default());

        // 8. 感嘆符・疑問符の全角正規化チェック（半角 ! ? 混入防止）
        registry.register(ExclamationNormalizationRule::default());

        // 9. 段落冒頭の字下げチェック（地の文の先頭全角1マス）
        registry.register(IndentFirstLineRule::default());

        // 10. ら抜き言葉チェック（見れる、食べれる等）
        registry.register(DroppingRaRule::default());

        // 11. 助詞「の」連続チェック
        registry.register(DoubledJoshiRule::default());

        // 12. 助詞「が」連続・多用チェック（1文中に3回以上）
        registry.register(DoubledJoshiRule::new(
            "no-doubled-joshi-ga",
            "助詞「が」の連続・多用",
            'が',
            2,
        ));

        // 13. 二重否定チェック（〜なくはない、〜ないわけではない等）
        registry.register(DoubleNegativeRule::default());

        // 14. 形式名詞・漢字の開きチェック
        registry.register(KanjiOpenCloseRule::default());

        registry
    }

    /// 登録ルールを実行し、指摘リストを収集（行番号・列番号順に整列）
    ///
    /// `enabled_settings` が渡された場合は設定マップに基づいて ON/OFF を適用
    pub fn check_all(
        &self,
        ctx: &CalibrationContext,
        enabled_settings: Option<&HashMap<String, bool>>,
    ) -> Vec<CalibrationIssue> {
        let mut all_issues = Vec::new();

        for rule in &self.rules {
            let is_enabled = match enabled_settings {
                Some(settings) => settings.get(rule.id()).copied().unwrap_or(rule.default_enabled()),
                None => rule.default_enabled(),
            };

            if is_enabled {
                all_issues.extend(rule.check(ctx));
            }
        }

        // 行番号、列番号の昇順でソート
        all_issues.sort_by(|a, b| {
            a.range
                .start_line
                .cmp(&b.range.start_line)
                .then_with(|| a.range.start_column.cmp(&b.range.start_column))
        });

        all_issues
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_registry_with_settings() {
        let registry = RuleRegistry::new_with_defaults();
        let lines = vec!["　これは 半角空白 と ｜全角パイプ です。"];
        let ctx = CalibrationContext {
            text: "　これは 半角空白 と ｜全角パイプ です。",
            lines: &lines,
            tokens: &[],
        };

        // 1. 全ルール有効時: 半角空白(4箇所) + 全角パイプ(1箇所) = 5件
        let issues_all = registry.check_all(&ctx, None);
        assert_eq!(issues_all.len(), 5);

        // 2. 半角空白禁止を OFF に設定した場合: 全角パイプ(1件) のみ検出
        let mut settings = HashMap::new();
        settings.insert("novel-no-half-width-space".to_string(), false);
        let issues_filtered = registry.check_all(&ctx, Some(&settings));
        assert_eq!(issues_filtered.len(), 1);
        assert_eq!(issues_filtered[0].rule_id, "novel-no-full-width-pipe");
    }
}
