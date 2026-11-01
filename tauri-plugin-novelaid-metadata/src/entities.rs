use crate::models::{EntityCategory, ProjectEntity};
use serde_json::Value;
use std::collections::HashMap;

/// オブジェクトから指定キーの配列・カンマ区切り・単一文字列を抽出して Vec<String> に正規化
pub fn extract_string_or_array(obj: &serde_json::Map<String, Value>, keys: &[&str]) -> Vec<String> {
    let mut results: Vec<String> = Vec::new();
    for key in keys {
        if let Some(val) = obj.get(*key) {
            if let Some(arr) = val.as_array() {
                for v in arr {
                    if let Some(s) = v.as_str() {
                        let trimmed = s.trim();
                        if !trimmed.is_empty() && !results.contains(&trimmed.to_string()) {
                            results.push(trimmed.to_string());
                        }
                    }
                }
            } else if let Some(s) = val.as_str() {
                for part in s.split(',') {
                    let trimmed = part.trim();
                    if !trimmed.is_empty() && !results.contains(&trimmed.to_string()) {
                        results.push(trimmed.to_string());
                    }
                }
            }
        }
    }
    results
}

/// タグ文字列からエンティティカテゴリを判定
pub fn determine_category(tags: &[String]) -> EntityCategory {
    for tag in tags {
        let lower = tag.to_lowercase();
        match lower.as_str() {
            "character" | "登場人物" | "人名" | "人物" | "chara" => return EntityCategory::Character,
            "location" | "places" | "地名" | "施設" | "場所" | "place" | "geo"
            | "geography" | "舞台" | "世界観" | "拠点" | "国" | "都市" | "ダンジョン" => {
                return EntityCategory::Location
            }
            "plot" | "構成" | "プロット" | "案" | "timeline" | "時間軸" | "年表"
            | "章" | "エピソード" => return EntityCategory::Plot,
            "term" | "用語" | "設定" | "magic" | "魔法" | "組織" => return EntityCategory::Term,
            "item" | "アイテム" | "魔導具" | "武器" => return EntityCategory::Item,
            _ => {}
        }
    }
    EntityCategory::Other
}

/// Frontmatter の Value から ProjectEntity を構築（該当する場合）
pub fn parse_entity_from_metadata(file_path: &str, metadata: &Value) -> Option<ProjectEntity> {
    let obj = metadata.as_object()?;

    // タグの取得（tags および単数形 tag、さらに type, category も吸収）
    let mut tags = extract_string_or_array(obj, &["tags", "tag"]);
    let type_or_cat = extract_string_or_array(obj, &["category", "type"]);
    for tc in type_or_cat {
        if !tags.contains(&tc) {
            tags.push(tc);
        }
    }

    let category = determine_category(&tags);

    // ファイル名（拡張子なし）
    let fallback_file_name = file_path
        .replace('\\', "/")
        .split('/')
        .last()
        .unwrap_or("entity")
        .trim_end_matches(".md")
        .trim_end_matches(".txt")
        .to_string();

    // 名前の判定: name -> title -> location/place/facility -> ファイル名
    let name_opt = obj
        .get("name")
        .and_then(|v| v.as_str())
        .or_else(|| obj.get("title").and_then(|v| v.as_str()))
        .or_else(|| obj.get("location").and_then(|v| v.as_str()))
        .or_else(|| obj.get("place").and_then(|v| v.as_str()))
        .or_else(|| obj.get("facility").and_then(|v| v.as_str()));

    let name = match name_opt {
        Some(n) if !n.trim().is_empty() => n.trim().to_string(),
        _ => {
            // タグが空かつ名前もない場合はエンティティ化しない
            if tags.is_empty() {
                return None;
            }
            fallback_file_name.clone()
        }
    };

    // ID の生成（指定がなければファイル名ベース）
    let id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| fallback_file_name);

    let reading = obj
        .get("reading")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());

    // エイリアス（別名・愛称）の抽出
    let mut aliases = extract_string_or_array(obj, &["aliases", "alias"]);

    // 姓名がある場合、名のみもエイリアス候補に
    if name.contains(' ') || name.contains('　') {
        let parts: Vec<&str> = name.split(|c| c == ' ' || c == '　').collect();
        for p in parts {
            let trimmed = p.trim();
            if !trimmed.is_empty() && !aliases.contains(&trimmed.to_string()) {
                aliases.push(trimmed.to_string());
            }
        }
    }

    let role = obj
        .get("role")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let summary = obj
        .get("summary")
        .or_else(|| obj.get("description"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // シリーズ・巻・章の抽出
    let series = extract_string_or_array(obj, &["series", "serieses"]);
    let books = extract_string_or_array(obj, &["books", "book", "volumes", "volume"]);
    let chapters = extract_string_or_array(obj, &["chapters", "chapter"]);

    Some(ProjectEntity {
        id,
        name,
        reading,
        aliases,
        category,
        role,
        summary,
        source_path: Some(file_path.to_string()),
        occurrence_count: 0,
        series,
        books,
        chapters,
    })
}

/// エンティティのインメモリストア
#[derive(Debug, Default, Clone)]
pub struct EntityStore {
    entities: HashMap<String, ProjectEntity>,
}

impl EntityStore {
    pub fn new() -> Self {
        Self {
            entities: HashMap::new(),
        }
    }

    pub fn insert(&mut self, entity: ProjectEntity) {
        self.entities.insert(entity.id.clone(), entity);
    }

    pub fn get_all(&self) -> Vec<ProjectEntity> {
        let mut list: Vec<ProjectEntity> = self.entities.values().cloned().collect();
        list.sort_by(|a, b| a.name.cmp(&b.name));
        list
    }

    pub fn get_by_category(&self, category: &EntityCategory) -> Vec<ProjectEntity> {
        let mut list: Vec<ProjectEntity> = self
            .entities
            .values()
            .filter(|e| &e.category == category)
            .cloned()
            .collect();
        list.sort_by(|a, b| a.name.cmp(&b.name));
        list
    }

    pub fn clear(&mut self) {
        self.entities.clear();
    }
}
