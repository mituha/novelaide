use crate::models::CalibrationIssue;
use crate::rules::context::CalibrationContext;
use crate::rules::even_symbol::EvenSymbolRule;
use crate::rules::CalibrationRule;

/// 三点リーダー偶数（2マス `……`）ルール
///
/// 共通の `EvenSymbolRule` を利用して三点リーダー（`…`）の2マス（偶数マス）使用を検証します。
pub struct ThreeDotsLeaderRule {
    inner: EvenSymbolRule,
}

impl Default for ThreeDotsLeaderRule {
    fn default() -> Self {
        Self {
            inner: EvenSymbolRule::three_dots_leader(),
        }
    }
}

impl CalibrationRule for ThreeDotsLeaderRule {
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
    fn test_three_dots_leader_rule() {
        let rule = ThreeDotsLeaderRule::default();
        let lines = vec![
            "彼は…言った。",       // 1マス単独 -> 指摘
            "彼女は……微笑んだ。",  // 2マス偶数 -> 正常
            "それは………本当かい？", // 3マス奇数 -> 指摘
            "静かに…………頷いた。",  // 4マス偶数 -> 正常
        ];
        let ctx = CalibrationContext {
            text: "",
            lines: &lines,
            tokens: &[],
        };

        let issues = rule.check(&ctx);
        assert_eq!(issues.len(), 2);
        assert_eq!(issues[0].range.start_line, 1);
        assert_eq!(issues[0].suggestion, Some("……".into()));
        assert_eq!(issues[1].range.start_line, 3);
        assert_eq!(issues[1].suggestion, Some("…………".into()));
    }
}
