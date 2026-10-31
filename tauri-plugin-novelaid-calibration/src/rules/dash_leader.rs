use crate::models::{CalibrationIssue, CalibrationRange};
use crate::rules::context::CalibrationContext;
use crate::rules::CalibrationRule;

/// ダッシュ文字かどうかを判定（全角ダッシュ U+2015, EMダッシュ U+2014, 罫線 U+2500）
pub fn is_dash_char(c: char) -> bool {
    matches!(c, '―' | '—' | '─')
}

/// ダッシュ偶数（2マス `――`）ルール
///
/// 小説作法では、ダッシュは2マス（偶数マス）で用いるのが原則です。
/// 単独（1マス）のダッシュを検知し、2マス（`――`）への修正を提案します。
pub struct DashLeaderRule {
    pub default_enabled: bool,
}

impl Default for DashLeaderRule {
    fn default() -> Self {
        Self {
            default_enabled: true,
        }
    }
}

impl CalibrationRule for DashLeaderRule {
    fn id(&self) -> &'static str {
        "novel-dash-leader"
    }

    fn name(&self) -> &'static str {
        "ダッシュ（2マス）"
    }

    fn rule_type(&self) -> &'static str {
        "novel_style"
    }

    fn default_enabled(&self) -> bool {
        self.default_enabled
    }

    fn check(&self, ctx: &CalibrationContext) -> Vec<CalibrationIssue> {
        let mut issues = Vec::new();

        for (line_idx, line) in ctx.lines.iter().enumerate() {
            let line_num = (line_idx + 1) as u32;
            let chars: Vec<char> = line.chars().collect();
            let mut i = 0;

            while i < chars.len() {
                if is_dash_char(chars[i]) {
                    let start_col = (i + 1) as u32;
                    let mut count = 0;
                    while i < chars.len() && is_dash_char(chars[i]) {
                        count += 1;
                        i += 1;
                    }
                    let end_col = (i + 1) as u32;

                    // 1マス単独のダッシュ、または奇数個のダッシュの場合に指摘
                    if count == 1 {
                        issues.push(CalibrationIssue {
                            id: format!("single-dash-{}-{}", line_num, start_col),
                            rule_id: self.id().to_string(),
                            rule_type: self.rule_type().to_string(),
                            message: "ダッシュは2マス（偶数「――」）で使用するのが作法です".into(),
                            range: CalibrationRange {
                                start_line: line_num,
                                start_column: start_col,
                                end_line: line_num,
                                end_column: end_col,
                            },
                            suggestion: Some("――".into()),
                        });
                    } else if count % 2 != 0 {
                        // 3マスなどの奇数の場合は偶数への修正提案
                        let suggested = "―".repeat(count + 1);
                        issues.push(CalibrationIssue {
                            id: format!("odd-dash-{}-{}", line_num, start_col),
                            rule_id: self.id().to_string(),
                            rule_type: self.rule_type().to_string(),
                            message: format!("ダッシュが奇数（{}マス）使われています。偶数マスで使用するのが作法です", count),
                            range: CalibrationRange {
                                start_line: line_num,
                                start_column: start_col,
                                end_line: line_num,
                                end_column: end_col,
                            },
                            suggestion: Some(suggested),
                        });
                    }
                } else {
                    i += 1;
                }
            }
        }

        issues
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
