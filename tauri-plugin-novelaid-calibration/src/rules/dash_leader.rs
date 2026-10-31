use crate::models::CalibrationIssue;
use crate::rules::context::CalibrationContext;
use crate::rules::even_symbol::EvenSymbolRule;
use crate::rules::CalibrationRule;

/// ダッシュ文字かどうかを判定（全角ダッシュ U+2015, EMダッシュ U+2014, 罫線 U+2500）
pub fn is_dash_char(c: char) -> bool {
    matches!(c, '―' | '—' | '─')
}

/// ダッシュ偶数（2マス `――`）ルール
///
/// 共通の `EvenSymbolRule` を利用してダッシュ（`―`）の2マス（偶数マス）使用を検証します。
pub struct DashLeaderRule {
    inner: EvenSymbolRule,
}

impl Default for DashLeaderRule {
    fn default() -> Self {
        Self {
            inner: EvenSymbolRule::dash_leader(),
        }
    }
}

impl CalibrationRule for DashLeaderRule {
    fn id(&self) -> &'static str {
        self.inner.id()
    }

    fn name(&self) -> &'static str {
        self.inner.name()
    }

    fn rule_type(&self) -> &'static str {
        self.inner.rule_type()
    }

    fn default_enabled(&self) -> bool {
        self.inner.default_enabled()
    }

    fn check(&self, ctx: &CalibrationContext) -> Vec<CalibrationIssue> {
        self.inner.check(ctx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dash_leader_rule() {
        let rule = DashLeaderRule::default();
        let lines = vec![
            "それは―突然だった。",     // 1マス単独ダッシュ -> 指摘
            "それは――突然だった。",    // 2マス偶数ダッシュ -> 正常
            "それは―――突然だった。",   // 3マス奇数ダッシュ -> 指摘
            "それは――――突然だった。",  // 4マス偶数ダッシュ -> 正常
        ];
        let ctx = CalibrationContext {
            text: "それは―突然だった。\nそれは――突然だった。\nそれは―――突然だった。\nそれは――――突然だった。",
            lines: &lines,
            tokens: &[],
        };

        let issues = rule.check(&ctx);
        assert_eq!(issues.len(), 2);
        assert_eq!(issues[0].range.start_line, 1);
        assert_eq!(issues[0].suggestion, Some("――".into()));
        assert_eq!(issues[1].range.start_line, 3);
        assert_eq!(issues[1].suggestion, Some("――――".into()));
    }
}
