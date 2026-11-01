use crate::models::{EntityCategory, ProjectEntity};
use serde_json::Value;
use std::collections::HashMap;

/// タグ文字列からエンティティカテゴリを判定
pub fn determine_category(tags: &[String]) -> EntityCategory {
    for tag in tags {
        let lower = tag.to_lowercase();
        match lower.as_str() {
            "character" | "登場人物" | "人名" | "人物" | "chara" => return EntityCategory::Character,
            "location" | "places" | "地名" | "施設" | "場所" | "place" | "geo" => {
                return EntityCategory::Location
            }
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

    // タグの取得
    let mut tags: Vec<String> = Vec::new();
    if let Some(t_val) = obj.get("tags") {
        if let Some(arr) = t_val.as_array() {
            for v in arr {
                if let Some(s) = v.as_str() {
                    tags.push(s.to_string());
                }
            }
        } else if let Some(s) = t_val.as_str() {
            for part in s.split(',') {
                let trimmed = part.trim();
                if !trimmed.is_empty() {
                    tags.push(trimmed.to_string());
                }
            }
        }
    }

    let category = determine_category(&tags);
    // カテゴリが特定できない場合でも、name や role または character タグがあれば採用
    let name_opt = obj
        .get("name")
        .and_then(|v| v.as_str())
        .or_else(|| obj.get("title").and_then(|v| v.as_str()));

    let name = match name_opt {
        Some(n) if !n.trim().is_empty() => n.trim().to_string(),
        _ => return None,
    };

    // ID の生成（指定がなければファイル名ベース）
    let id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            file_path
                .replace('\\', "/")
                .split('/')
                .last()
                .unwrap_or("entity")
                .trim_end_matches(".md")
                .to_string()
        });

    let reading = obj
        .get("reading")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());

    // エイリアス（別名・愛称）の抽出
    let mut aliases: Vec<String> = Vec::new();
    if let Some(a_val) = obj.get("aliases") {
        if let Some(arr) = a_val.as_array() {
            for v in arr {
                if let Some(s) = v.as_str() {
                    let trimmed = s.trim();
                    if !trimmed.is_empty() {
                        aliases.push(trimmed.to_string());
                    }
                }
            }
        }
    }
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
